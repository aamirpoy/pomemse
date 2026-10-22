import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Ban, Trash2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { isOwnerId } from "@/lib/owner";

type Device = {
  id: string;
  user_id: string;
  device_id: string;
  user_agent: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  last_seen_at: string | null;
};

function shortAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  if (/iPhone|iPad/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android phone";
  if (/Windows/i.test(ua)) return "Windows computer";
  if (/Mac OS/i.test(ua)) return "Mac computer";
  if (/Linux/i.test(ua)) return "Linux computer";
  return "Other device";
}

export function Devices({ profiles, selfId }: { profiles: { id: string; full_name: string }[]; selfId: string }) {
  const qc = useQueryClient();
  const devices = useQuery({
    queryKey: ["trusted-devices"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from("trusted_devices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Device[];
    },
  });
  const credentials = useQuery({
    queryKey: ["admin-passkeys"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from("webauthn_credentials").select("id,user_id,label,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  async function resetPasskeys(userId: string, credentialId?: string) {
    if (!confirm(`${credentialId ? "Remove this passkey" : "Reset all passkeys"} for ${name(userId)}? Removed passkeys will no longer work. They can set up a new one on their phone.`)) return;
    const { error } = await supabase.rpc("admin_reset_passkeys", { _user: userId, ...(credentialId ? { _credential: credentialId } : {}) });
    if (error) { toast.error(error.message); return; }
    toast.success("Passkey removed. The employee can set up a new one.");
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-passkeys"] }), qc.invalidateQueries({ queryKey: ["my-bio-creds"] }), qc.invalidateQueries({ queryKey: ["audit_log"] })]);
  }
  const name = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? "Unknown";

  async function setStatus(d: Device, status: "approved" | "rejected") {
    const { error } = await supabase.from("trusted_devices").update({
      status,
      approved_by: selfId,
      approved_at: new Date().toISOString(),
    }).eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? `Device approved for ${name(d.user_id)}` : `Device blocked for ${name(d.user_id)}`);
    qc.invalidateQueries({ queryKey: ["trusted-devices"] });
  }
  async function remove(d: Device) {
    if (!confirm(`Remove this device for ${name(d.user_id)}? They will need approval again.`)) return;
    const { error } = await supabase.from("trusted_devices").delete().eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["trusted-devices"] });
  }

  const list = devices.data ?? [];
  const pending = list.filter((d) => d.status === "pending");
  const rest = list.filter((d) => d.status !== "pending");

  const row = (d: Device) => (
    <li key={d.id} className="flex flex-wrap items-center gap-3 p-4">
      <div className="flex-1 min-w-48">
        <div className="font-medium">{name(d.user_id)}</div>
        <div className="text-sm text-muted-foreground">
          {shortAgent(d.user_agent)} · first seen {fmtDate(d.created_at)} {fmtTime(d.created_at)}
          {d.last_seen_at && ` · last used ${fmtDate(d.last_seen_at)}`}
        </div>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        d.status === "approved" ? "bg-success text-success-foreground" : d.status === "rejected" ? "bg-destructive text-destructive-foreground" : "bg-secondary"
      }`}>{d.status === "pending" ? "Waiting for approval" : d.status}</span>
      {d.status !== "approved" && <Button size="sm" variant="outline" onClick={() => setStatus(d, "approved")}><Check /> Approve</Button>}
      {d.status !== "rejected" && <Button size="sm" variant="outline" onClick={() => setStatus(d, "rejected")}><Ban /> Block</Button>}
      <Button size="icon" variant="ghost" aria-label="Remove device" onClick={() => remove(d)}><Trash2 /></Button>
    </li>
  );

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h2 className="text-2xl">Devices</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          V4 · Registered devices — approval requests and phone changes
        </p>
      </div>
      <details className="border-y py-4">
        <summary className="cursor-pointer font-medium">One-time setup & changing phones</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>In Testing versions, enable V4 Registered devices for the employee. Enable V5 Face / fingerprint check-in if required.</li>
          <li>The employee signs in on their own phone and taps Register this device on My time. No location or check-in is needed to request approval.</li>
            <li>Confirm the phone belongs to that employee, then approve its request below. Each browser can be registered to only one account. Only an admin can remove that registration before reassignment.</li>
          <li>For V5, the employee taps Set up now on their phone. Their phone handles the passkey unlock; the app does not receive a face or fingerprint.</li>
          <li>When changing phones, block or remove the old device, reset the old passkeys below, then repeat registration and setup on the new phone.</li>
        </ol>
      </details>
      {devices.isError && <div className="flex items-center gap-3 text-destructive">Could not load devices.<Button variant="outline" onClick={() => devices.refetch()}>Retry</Button></div>}
      {!!pending.length && (
        <section className="rounded-xl border border-primary bg-card shadow-soft">
          <h3 className="border-b px-5 py-3 font-semibold">Waiting for approval ({pending.length})</h3>
          <ul className="divide-y">{pending.map(row)}</ul>
        </section>
      )}
      <section className="rounded-xl border bg-card shadow-soft">
        <h3 className="border-b px-5 py-3 font-semibold">All devices</h3>
        {rest.length ? <ul className="divide-y">{rest.map(row)}</ul> : <p className="p-5 text-sm text-muted-foreground">No devices yet.</p>}
      </section>
      <section>
        <h3 className="text-xl">V5 · Employee passkeys</h3>
        {credentials.isError && <div className="py-3 text-destructive">Could not load passkeys. <Button variant="outline" onClick={() => credentials.refetch()}>Retry</Button></div>}
        <ul className="mt-3 divide-y border-y">
          {profiles.map((p) => {
            const keys = credentials.data?.filter((c) => c.user_id === p.id) ?? [];
            const protectedOwner = isOwnerId(p.id) && !isOwnerId(selfId);
            return <li key={p.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-medium">{p.full_name}</div><div className="text-sm text-muted-foreground">{credentials.isPending ? "Loading…" : `${keys.length} passkey${keys.length === 1 ? "" : "s"}`}</div></div>
                <Button variant="outline" size="sm" disabled={!keys.length || protectedOwner} onClick={() => resetPasskeys(p.id)}><RotateCcw /> Reset all passkeys</Button>
              </div>
              {keys.map((c) => <div key={c.id} className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-muted-foreground">{c.label ? shortAgent(c.label) : "Passkey"} · {fmtDate(c.created_at)} {fmtTime(c.created_at)}</span>
                <Button size="icon" variant="ghost" aria-label={`Remove passkey for ${p.full_name}`} disabled={protectedOwner} onClick={() => resetPasskeys(p.id, c.id)}><Trash2 /></Button>
              </div>)}
            </li>;
          })}
        </ul>
      </section>
    </div>
  );
}
