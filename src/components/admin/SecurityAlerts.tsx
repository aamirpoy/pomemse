import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtTime } from "@/lib/time";
import { Button } from "@/components/ui/button";

const FLAG_LABEL: Record<string, string> = {
  new_device: "New device",
  shared_device: "Device used by another employee",
  shared_ip: "Same network as another employee",
  outside_office: "Tried outside office",
  far_away: "Very far from office",
  low_accuracy: "Weak GPS accuracy",
  fake_gps_sign: "Possible fake GPS",
  repeated_failures: "Repeated failed tries",
  impossible_travel: "Impossible travel speed",
  no_device_id: "Device unknown",
};
const ACTION_LABEL: Record<string, string> = {
  check_in: "Check in", check_out: "Check out", meeting_out: "Going out", meeting_back: "Back in office",
};

export function useNewAlertCount() {
  return useQuery({
    queryKey: ["alert-count"],
    refetchInterval: 60000,
    queryFn: async () => (await supabase.from("punch_events").select("id", { count: "exact", head: true }).eq("status", "new")).count ?? 0,
  });
}

export function SecurityAlerts({ names }: { names: Record<string, string> }) {
  const qc = useQueryClient();
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [status, setStatus] = useState("new");
  const rows = useQuery({
    queryKey: ["punch-events", flaggedOnly, status],
    queryFn: async () => {
      let q = supabase.from("punch_events").select("*").order("created_at", { ascending: false }).limit(300);
      if (flaggedOnly) q = q.neq("flags", "{}");
      if (status !== "all") q = q.eq("status", status);
      return (await q).data ?? [];
    },
  });

  async function setReview(id: string, s: string, note?: string) {
    const { error } = await supabase.from("punch_events").update({ status: s, ...(note !== undefined ? { admin_note: note } : {}) }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["punch-events"] });
    qc.invalidateQueries({ queryKey: ["alert-count"] });
  }

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> Flagged only
        </label>
        <select className="h-9 rounded-md border bg-background px-3" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="new">New</option><option value="reviewed">Reviewed</option>
          <option value="dismissed">Dismissed</option><option value="all">All</option>
        </select>
        <span className="text-muted-foreground">Employees are never told about these alerts.</span>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b"><th className="p-3">When</th><th>Employee</th><th>Action</th><th>Device & IP</th><th>Location</th><th>Flags</th><th className="pr-3">Review</th></tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="p-3 whitespace-nowrap">{fmtDate(r.created_at)}<div className="text-xs text-muted-foreground">{fmtTime(r.created_at)}</div></td>
                <td className="py-3 font-medium">{names[r.user_id] ?? "—"}</td>
                <td className="py-3">{ACTION_LABEL[r.action] ?? r.action}{!r.success && <div className="text-xs text-destructive">blocked</div>}</td>
                <td className="max-w-[220px] py-3 text-xs">
                  <div className="font-mono">{r.device_id?.slice(0, 8) ?? "—"}</div>
                  <div className="font-mono">{r.ip ?? "—"}</div>
                  <div className="truncate text-muted-foreground" title={r.user_agent ?? ""}>{r.user_agent}</div>
                </td>
                <td className="py-3 text-xs">
                  {r.lat != null ? <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}>{r.distance_m} m away</a> : "—"}
                  {r.accuracy_m != null && <div className="text-muted-foreground">±{Math.round(r.accuracy_m)} m</div>}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.flags.length === 0 && <span className="text-xs text-muted-foreground">OK</span>}
                    {r.flags.map((f) => <span key={f} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{FLAG_LABEL[f] ?? f}</span>)}
                  </div>
                  {r.admin_note && <div className="mt-1 text-xs italic">Note: {r.admin_note}</div>}
                </td>
                <td className="py-3 pr-3">
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" onClick={() => setReview(r.id, "reviewed")}>Reviewed</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReview(r.id, "dismissed")}>Dismiss</Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const n = prompt("Admin note", r.admin_note ?? "");
                      if (n !== null) setReview(r.id, r.status, n);
                    }}>Note</Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.data?.length === 0 && <tr><td colSpan={7} className="p-4 text-muted-foreground">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
