import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Ban, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtTime } from "@/lib/time";
import { Button } from "@/components/ui/button";

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
          When "Registered devices" is on for an employee, check-in only works from devices you approve here.
          New devices appear as "Waiting for approval" the first time the employee tries.
        </p>
      </div>
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
    </div>
  );
}
