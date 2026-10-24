import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/app-toast";
import { requestErrorMessage } from "@/lib/request-errors";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader, useMe } from "@/components/AppHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  fmtDate, fmtDuration, fmtTime, getPosition, workedMs, employeeTotalMs, type AttendanceRow,
} from "@/lib/time";
import { deviceInfo } from "@/lib/device";
import { confirmedPunch } from "@/lib/punch-result";
import { LanguageProvider, useLang } from "@/lib/i18n";
import { getBioRegistrationOptions, verifyBioRegistration, getBioAuthOptions, verifyBioAuth } from "@/lib/biometric.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My time — POME" },
      { name: "description", content: "Check in, check out and see your hours." },
      { property: "og:title", content: "My time — POME" },
      { property: "og:description", content: "Check in, check out and see your hours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Dashboard() {
  const { data: me } = useMe();
  const versions = useQuery({
    queryKey: ["my-feature-versions", me?.id],
    enabled: !!me,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_feature_versions");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <LanguageProvider enabled={versions.data?.includes("arabic_language") ?? false}>
      <DashboardBody />
    </LanguageProvider>
  );
}

function DashboardBody() {
  const { t, locale } = useLang();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string }>();

  const records = useQuery({
    queryKey: ["my-attendance", me?.id],
    enabled: !!me,
    queryFn: async () => {
      if (!me) return [];
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("attendance").select("*").eq("user_id", me.id)
        .gte("check_in_at", since).order("check_in_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  const versions = useQuery({
    queryKey: ["my-feature-versions", me?.id],
    enabled: !!me,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_feature_versions");
      if (error) throw error;
      return data ?? [];
    },
  });

  const bioOn = versions.data?.includes("biometric_check") ?? false;
  const approvalOn = versions.data?.includes("device_approval") ?? false;
  const [currentDevice, setCurrentDevice] = useState<string>();
  useEffect(() => { if (approvalOn) setCurrentDevice(deviceInfo()._device); }, [approvalOn]);
  const myDevice = useQuery({
    queryKey: ["my-device", me?.id, currentDevice],
    enabled: !!me && approvalOn && !!currentDevice,
    refetchInterval: 10000,
    queryFn: async () => {
      if (!me || !currentDevice) return null;
      const { data, error } = await supabase.from("trusted_devices").select("status").eq("user_id", me.id).eq("device_id", currentDevice).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  async function registerDevice() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("register_my_device", deviceInfo());
      if (error) throw error;
      const result = data as { status?: string; error?: string };
      if (result.error) throw new Error(result.error);
      if (result.status === "rejected") throw new Error("This device is blocked. Please contact your admin.");
      toast.success(t(result.status === "approved" ? "This device is already approved." : "Device sent to your admin for approval."));
      await Promise.all([myDevice.refetch(), qc.invalidateQueries({ queryKey: ["trusted-devices"] })]);
    } catch (e: unknown) { toast.error(t(requestErrorMessage(e))); }
    finally { setBusy(false); }
  }
  const bioCreds = useQuery({
    queryKey: ["my-bio-creds", me?.id],
    enabled: !!me && bioOn,
    refetchInterval: 10000,
    queryFn: async () => {
      if (!me) return [];
      const { data, error } = await supabase.from("webauthn_credentials").select("id").eq("user_id", me.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const bioAuthOptions = useServerFn(getBioAuthOptions);
  const bioAuthVerify = useServerFn(verifyBioAuth);
  const bioRegOptions = useServerFn(getBioRegistrationOptions);
  const bioRegVerify = useServerFn(verifyBioRegistration);

  async function verifyBio() {
    const { startAuthentication } = await import("@simplewebauthn/browser");
    const options = await bioAuthOptions({});
    const response = await startAuthentication({ optionsJSON: options });
    await bioAuthVerify({ data: { response } });
  }

  async function setupBio() {
    setBusy(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const options = await bioRegOptions({});
      const response = await startRegistration({ optionsJSON: options });
      await bioRegVerify({ data: { response, label: navigator.userAgent.slice(0, 80) } });
      toast.success(t("Face / fingerprint set up on this device."));
      qc.invalidateQueries({ queryKey: ["my-bio-creds"] });
    } catch (e: any) {
      toast.error(/cancel|abort|NotAllowed/i.test(e.message ?? e.name ?? "") ? t("Setup cancelled.") : t(requestErrorMessage(e)));
    } finally { setBusy(false); }
  }

  const open = records.data?.find((r) => !r.check_out_at);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
  const sumSince = (d: Date) =>
    employeeTotalMs((records.data ?? []).filter((r) => new Date(r.check_in_at) >= d), now);

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const outing = useQuery({
    queryKey: ["my-outing", open?.id],
    enabled: !!open,
    queryFn: async () => {
      if (!open) return [];
      const { data, error } = await supabase.from("work_outings").select("*").eq("attendance_id", open.id).order("out_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const currentOut = outing.data?.find((o) => !o.back_at);
  const [outOpen, setOutOpen] = useState(false);
  const [reason, setReason] = useState("");
  async function toggleOuting(r?: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setFeedback(undefined);
    toast.dismiss();
    try {
      const expected = currentOut ? "back" : "out";
      const pos = await getPosition();
      const { data, error } = await supabase.rpc("outing_action", {
        ...(r ? { _reason: r } : {}),
        _lat: pos.coords.latitude, _lng: pos.coords.longitude, _acc: pos.coords.accuracy, _captured_at: pos.timestamp,
        ...deviceInfo(),
      });
      if (error) throw error;
      const res = confirmedPunch(data, expected);
      const saved = await supabase.from("work_outings").select("id,back_at").eq("id", res.recordId).single();
      if (saved.error || !saved.data || (expected === "back" ? !saved.data.back_at : !!saved.data.back_at)) throw new Error("Result not confirmed. Refresh to check your status before trying again.");
      const message = t(expected === "back" ? "Welcome back!" : "Marked as out for work. Your hours keep counting.");
      setFeedback({ ok: true, message });
      toast.success(message);
      setOutOpen(false); setReason("");
      await qc.invalidateQueries({ queryKey: ["my-outing"] });
    } catch (e: any) {
      const message = e.message?.includes("denied") ? t("Please allow location access.") : t(requestErrorMessage(e));
      setFeedback({ ok: false, message }); toast.error(message);
      await Promise.all([records.refetch(), outing.refetch()]);
    } finally { setBusy(false); actionLock.current = false; }
  }

  async function clock(withNote?: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setNoteOpen(false);
    setBusy(true);
    setFeedback(undefined);
    toast.dismiss();
    try {
      const expected = open ? "check_out" : "check_in";
      if (bioOn) await verifyBio();
      const pos = await getPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      const { data, error } = await supabase.rpc("clock_action", { _lat: latitude, _lng: longitude, _acc: accuracy, _captured_at: pos.timestamp, ...deviceInfo(), ...(withNote?.trim() ? { _note: withNote.trim() } : {}) });
      if (error) throw error;
      const res = confirmedPunch(data, expected);
      const saved = await supabase.from("attendance").select("id,check_out_at").eq("id", res.recordId).single();
      if (saved.error || !saved.data || (expected === "check_out" ? !saved.data.check_out_at : !!saved.data.check_out_at)) throw new Error("Result not confirmed. Refresh to check your status before trying again.");
      const message = t(expected === "check_in" ? "Checked in. Have a good day!" : "Checked out. See you next time!");
      setFeedback({ ok: true, message }); toast.success(message);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["my-attendance"] });
    } catch (e: any) {
      const message = e.message?.includes("denied") ? t("Please allow location access to check in.") : t(requestErrorMessage(e));
      setFeedback({ ok: false, message }); toast.error(message);
      await Promise.all([records.refetch(), outing.refetch()]);
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }

  // group by day
  const byDay = new Map<string, AttendanceRow[]>();
  (records.data ?? []).forEach((r) => {
    const k = new Date(r.check_in_at).toDateString();
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(open ? "Check out" : "Check in")}</DialogTitle>
            <DialogDescription>{t("Add a note if needed (e.g. reason for being late or leaving early). You can skip this.")}</DialogDescription>
          </DialogHeader>
          <Textarea maxLength={500} placeholder={t("Optional note…")} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => clock()}>{t("Skip")}</Button>
            <Button onClick={() => clock(note)} disabled={!note.trim() || busy}>{t("Save note &")} {t(open ? "check out" : "check in")}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={outOpen} onOpenChange={setOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Going out for work")}</DialogTitle>
            <DialogDescription>{t("Where are you going? (e.g. client meeting, site visit). Your hours keep counting.")}</DialogDescription>
          </DialogHeader>
          <Textarea maxLength={500} placeholder={t("Reason…")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOutOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={() => toggleOuting(reason.trim())} disabled={!reason.trim() || busy}>{t("Go out")}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {feedback && <div role="status" className={`border-l-4 p-4 ${feedback.ok ? "border-success bg-success/10" : "border-destructive bg-destructive/10"}`}>
          <div className="font-semibold">{feedback.ok ? t("Saved") : t("Not confirmed — check your status")}</div>
          <p className="mt-1 text-sm">{feedback.message}</p>
          {!feedback.ok && <Button variant="outline" className="mt-3" onClick={() => window.location.reload()}>{t("Refresh")}</Button>}
        </div>}
        {(records.isError || versions.isError || outing.isError) && <div role="alert" className="flex flex-wrap items-center gap-3 border-y py-4 text-destructive">
          <span className="min-w-0 flex-1">{t(requestErrorMessage(records.error ?? versions.error ?? outing.error))}</span>
          <Button variant="outline" onClick={() => Promise.all([records.refetch(), versions.refetch(), ...(open ? [outing.refetch()] : [])])}>{t("Retry")}</Button>
        </div>}
        {approvalOn && <section className="flex flex-wrap items-center gap-3 border-y py-4">
          <div className="min-w-0 flex-1"><div className="font-semibold">{t("Registered device")}</div><div className="text-sm text-muted-foreground">{t(myDevice.isError ? "Could not load device approval." : myDevice.isPending ? "Checking approval…" : myDevice.data?.status === "approved" ? "Approved" : myDevice.data?.status === "pending" ? "Waiting for admin approval" : myDevice.data?.status === "rejected" ? "Blocked — contact your admin" : "Not registered")}</div></div>
          {myDevice.isError ? <Button variant="outline" onClick={() => myDevice.refetch()}>{t("Retry")}</Button> : !myDevice.isPending && !myDevice.data && <Button onClick={registerDevice} disabled={busy}>{t("Register this device")}</Button>}
        </section>}
        {bioOn && bioCreds.data?.length === 0 && (
          <section className="flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-card p-5 shadow-soft">
            <div className="min-w-56 flex-1">
              <div className="font-semibold">{t("Set up face / fingerprint")}</div>
              <p className="text-sm text-muted-foreground">{t("Your admin requires face or fingerprint verification at check-in. Set it up once on this device.")}</p>
            </div>
            <Button onClick={setupBio} disabled={busy}>{t("Set up now")}</Button>
          </section>
        )}
        <section className="overflow-hidden rounded-2xl bg-hero p-8 text-primary-foreground shadow-soft md:p-12">
          <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">
                {new Date(now).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <div className="mt-3 font-mono text-6xl tabular-nums md:text-7xl">
                {new Date(now).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <p className="mt-4 text-lg opacity-85">
                {open
                  ? <>{t("Checked in at")} <b>{fmtTime(open.check_in_at)}</b> · {fmtDuration(workedMs(open, now))} {t("so far")}</>
                  : <>{t("Hi")} {me?.profile?.full_name?.split(" ")[0] || t("there")}, {t("you're not checked in.")}</>}
              </p>
              {open && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {currentOut && (
                    <span className="text-sm opacity-85">
                      {t("Out for work since")} <b>{fmtTime(currentOut.out_at)}</b> · {fmtDuration(workedMs({ check_in_at: currentOut.out_at, check_out_at: null }, now))}
                    </span>
                  )}
                  <Button variant="secondary" disabled={busy || records.isError || outing.isError || outing.isLoading || versions.isPending || versions.isError}
                    onClick={() => (currentOut ? toggleOuting() : setOutOpen(true))}>
                    {t(currentOut ? "Back in office" : "Going out for work / meeting")}
                  </Button>
                </div>
              )}
            </div>
            <Button
              onClick={() => setNoteOpen(true)}
              disabled={busy || records.isLoading || records.isError || versions.isPending || versions.isError}
              className={`flex h-44 w-44 shrink-0 flex-col items-center justify-center rounded-full text-lg font-semibold transition-transform active:scale-95 disabled:opacity-60 ${
                open ? "bg-primary-foreground text-primary" : "bg-accent text-accent-foreground animate-pulse-ring"
              }`}
            >
              {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : t(open ? "Check out" : "Check in")}
              {busy && <span className="mt-1 text-xs font-normal opacity-70">{t("Please wait…")}</span>}
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ["Today", fmtDuration(sumSince(startOfDay))],
            ["This week", fmtDuration(sumSince(startOfWeek))],
            ["Last 30 days", fmtDuration(sumSince(new Date(0)))],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl border bg-card p-5 shadow-soft">
              <div className="text-sm text-muted-foreground">{t(l ?? "")}</div>
              <div className="mt-1 font-mono text-3xl">{v}</div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border bg-card shadow-soft">
          <h2 className="border-b px-5 py-4 text-xl">{t("My timesheet")}</h2>
          {byDay.size === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t("No records yet. Check in when you arrive at the office.")}</p>
          ) : (
            <ul className="divide-y">
              {[...byDay.entries()].map(([day, rows]) => (
                <li key={day} className="flex flex-wrap items-center gap-4 px-5 py-3">
                  <span className="w-32 font-medium">{rows[0] ? fmtDate(rows[0].check_in_at) : day}</span>
                  <span dir="ltr" className="flex-1 text-start text-sm text-muted-foreground">
                    {rows.slice().reverse().map((r) => `${fmtTime(r.check_in_at)} – ${r.check_out_at ? fmtTime(r.check_out_at) : t("now")}`).join(", ")}
                  </span>
                  <span className="font-mono">{fmtDuration(employeeTotalMs(rows, now))}</span>
                  {versions.data?.includes("admin_notes") && rows.filter((r) => r.admin_note).map((r) => (
                    <div key={r.id} className="w-full rounded-md bg-secondary px-3 py-2 text-sm">
                      <span className="font-semibold">{t("Note from")} {r.admin_note_by}</span>
                      <span className="text-muted-foreground"> · {r.admin_note_at ? fmtDate(r.admin_note_at) : ""}</span>
                      <div>{r.admin_note}</div>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
