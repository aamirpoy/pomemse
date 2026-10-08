import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader, useMe } from "@/components/AppHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  fmtDate, fmtDuration, fmtTime, getPosition, workedMs, employeeTotalMs, type AttendanceRow,
} from "@/lib/time";

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
  const qc = useQueryClient();
  const { data: me } = useMe();
  const now = useNow();
  const [busy, setBusy] = useState(false);

  const records = useQuery({
    queryKey: ["my-attendance", me?.id],
    enabled: !!me,
    queryFn: async () => {
      if (!me) return [];
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("attendance").select("*").eq("user_id", me.id)
        .gte("check_in_at", since).order("check_in_at", { ascending: false });
      return (data ?? []) as AttendanceRow[];
    },
  });

  const open = records.data?.find((r) => !r.check_out_at);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
  const sumSince = (d: Date) =>
    employeeTotalMs((records.data ?? []).filter((r) => new Date(r.check_in_at) >= d), now);

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  async function clock(withNote?: string) {
    setNoteOpen(false);
    setBusy(true);
    try {
      const pos = await getPosition();
      const { latitude, longitude } = pos.coords;
      const { data, error } = await supabase.rpc("clock_action", { _lat: latitude, _lng: longitude, ...(withNote?.trim() ? { _note: withNote.trim() } : {}) });
      if (error) throw error;
      const res = data as { action: string };
      toast.success(res.action === "check_in" ? "Checked in. Have a good day!" : "Checked out. See you next time!");
      setNote("");
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
    } catch (e: any) {
      toast.error(e.message?.includes("denied") ? "Please allow location access to check in." : e.message);
    } finally {
      setBusy(false);
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
            <DialogTitle>{open ? "Check out" : "Check in"}</DialogTitle>
            <DialogDescription>Add a note if needed (e.g. reason for being late or leaving early). You can skip this.</DialogDescription>
          </DialogHeader>
          <Textarea maxLength={500} placeholder="Optional note…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => clock()}>Skip</Button>
            <Button onClick={() => clock(note)} disabled={!note.trim()}>Save note & {open ? "check out" : "check in"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <section className="overflow-hidden rounded-2xl bg-hero p-8 text-primary-foreground shadow-soft md:p-12">
          <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">
                {new Date(now).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <div className="mt-3 font-mono text-6xl tabular-nums md:text-7xl">
                {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <p className="mt-4 text-lg opacity-85">
                {open
                  ? <>Checked in at <b>{fmtTime(open.check_in_at)}</b> · {fmtDuration(workedMs(open, now))} so far</>
                  : <>Hi {me?.profile?.full_name?.split(" ")[0] || "there"}, you're not checked in.</>}
              </p>
            </div>
            <Button
              onClick={() => setNoteOpen(true)}
              disabled={busy || records.isLoading}
              className={`flex h-44 w-44 shrink-0 flex-col items-center justify-center rounded-full text-lg font-semibold transition-transform active:scale-95 disabled:opacity-60 ${
                open ? "bg-primary-foreground text-primary" : "bg-accent text-accent-foreground animate-pulse-ring"
              }`}
            >
              {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : open ? "Check out" : "Check in"}
              {busy && <span className="mt-1 text-xs font-normal opacity-70">Please wait…</span>}
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
              <div className="text-sm text-muted-foreground">{l}</div>
              <div className="mt-1 font-mono text-3xl">{v}</div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border bg-card shadow-soft">
          <h2 className="border-b px-5 py-4 text-xl">My timesheet</h2>
          {byDay.size === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No records yet. Check in when you arrive at the office.</p>
          ) : (
            <ul className="divide-y">
              {[...byDay.entries()].map(([day, rows]) => (
                <li key={day} className="flex flex-wrap items-center gap-4 px-5 py-3">
                  <span className="w-32 font-medium">{rows[0] ? fmtDate(rows[0].check_in_at) : day}</span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {rows.slice().reverse().map((r) => `${fmtTime(r.check_in_at)} – ${r.check_out_at ? fmtTime(r.check_out_at) : "now"}`).join(", ")}
                  </span>
                  <span className="font-mono">{fmtDuration(employeeTotalMs(rows, now))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
