import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

/** Loaded lazily inside handlers; the library needs the reflect polyfill on the edge runtime. */
async function wa() {
  await import("reflect-metadata");
  const [server, helpers] = await Promise.all([
    import("@simplewebauthn/server"),
    import("@simplewebauthn/server/helpers"),
  ]);
  return { ...server, isoBase64URL: helpers.isoBase64URL };
}
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Relying-party id + origin derived from the incoming request host. */
function rp() {
  const h = getRequestHeaders();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0]?.trim() ?? "localhost";
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() ?? "https";
  return { rpID: host.split(":")[0] ?? "localhost", origin: `${proto}://${host}` };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function saveChallenge(userId: string, challenge: string) {
  const db = await admin();
  await db.from("webauthn_challenges").upsert({
    user_id: userId,
    challenge,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
}

async function takeChallenge(userId: string) {
  const db = await admin();
  const { data } = await db.from("webauthn_challenges").select("*").eq("user_id", userId).maybeSingle();
  await db.from("webauthn_challenges").delete().eq("user_id", userId);
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw new Error("Verification expired. Please try again.");
  return data.challenge as string;
}

export const getBioRegistrationOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rpID } = rp();
    const db = await admin();
    const { data: existing } = await db.from("webauthn_credentials").select("credential_id, transports").eq("user_id", context.userId);
    const options = await (await wa()).generateRegistrationOptions({
      rpName: "POME",
      rpID,
      userName: context.userId,
      userDisplayName: context.claims?.email ?? "Employee",
      attestationType: "none",
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id, transports: (c.transports ?? []) as any })),
    });
    await saveChallenge(context.userId, options.challenge);
    return options as any;
  });

export const verifyBioRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ response: z.any(), label: z.string().trim().max(80).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { rpID, origin } = rp();
    const expectedChallenge = await takeChallenge(context.userId);
    const { verified, registrationInfo } = await (await wa()).verifyRegistrationResponse({
      response: data.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verified || !registrationInfo) throw new Error("Verification failed. Please try again.");
    const { credential } = registrationInfo;
    const db = await admin();
    const { error } = await db.from("webauthn_credentials").insert({
      user_id: context.userId,
      credential_id: credential.id,
      public_key: (await wa()).isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      label: data.label || null,
    });
    if (error) throw new Error("Could not save this device verification.");
    return { ok: true };
  });

export const getBioAuthOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rpID } = rp();
    const db = await admin();
    const { data: creds } = await db.from("webauthn_credentials").select("credential_id, transports").eq("user_id", context.userId);
    if (!creds?.length) throw new Error("No face or fingerprint set up yet.");
    const options = await (await wa()).generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: (c.transports ?? []) as any })),
    });
    await saveChallenge(context.userId, options.challenge);
    return options as any;
  });

export const verifyBioAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ response: z.any() }).parse(d))
  .handler(async ({ data, context }) => {
    const { rpID, origin } = rp();
    const expectedChallenge = await takeChallenge(context.userId);
    const credId: string = data.response?.id;
    if (!credId) throw new Error("Verification failed. Please try again.");
    const db = await admin();
    const { data: cred } = await db.from("webauthn_credentials").select("*").eq("credential_id", credId).eq("user_id", context.userId).maybeSingle();
    if (!cred) throw new Error("This face or fingerprint is not registered.");
    const { verified, authenticationInfo } = await (await wa()).verifyAuthenticationResponse({
      response: data.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey: (await wa()).isoBase64URL.toBuffer(cred.public_key),
        counter: Number(cred.counter),
        transports: (cred.transports ?? []) as any,
      },
    });
    if (!verified) throw new Error("Verification failed. Please try again.");
    await db.from("webauthn_credentials").update({ counter: authenticationInfo.newCounter }).eq("id", cred.id);
    // Short-lived pass consumed by clock_action within 2 minutes.
    await db.from("biometric_passes").upsert({ user_id: context.userId, created_at: new Date().toISOString() });
    return { ok: true };
  });
