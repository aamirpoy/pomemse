import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Download } from "lucide-react";
import { fmtDate, fmtTime } from "@/lib/time";

type Kind = "punch_events" | "attendance" | "work_outings" | "audit_log";
const categories: Record<Kind, string> = { punch_events: "Security events", attendance: "Completed timesheets", work_outings: "Completed work outings", audit_log: "Change log (older than 30 days)" };
export function DataCleanup({ names }: { names: Record<string, string> }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("punch_events");
  const [before, setBefore] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ ids: string[]; count: number; linked_outings: number }>();
  const [confirmation, setConfirmation] = useState("");
  const rows = useQuery({ queryKey: ["cleanup-records", kind, before], enabled: !!before, queryFn: async () => {
    const cutoff = new Date(before + "T00:00:00").toISOString();
    if (kind === "attendance") {
      const { data, error } = await supabase.from("attendance").select("id,user_id,check_in_at,check_out_at").not("check_out_at", "is", null).lt("check_in_at", cutoff).order("check_in_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []).map(r => ({ id: r.id, user: r.user_id, at: r.check_in_at, detail: `Check out: ${fmtTime(r.check_out_at)}` }));
    }
    if (kind === "work_outings") {
      const { data, error } = await supabase.from("work_outings").select("id,user_id,out_at,reason").not("back_at", "is", null).lt("out_at", cutoff).order("out_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []).map(r => ({ id: r.id, user: r.user_id, at: r.out_at, detail: r.reason ?? "Work outing" }));
    }
    if (kind === "audit_log") {
      const { data, error } = await supabase.from("audit_log").select("id,actor_id,created_at,table_name,action").lt("created_at", new Date(Math.min(new Date(cutoff).getTime(), Date.now()-30*86400000)).toISOString()).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []).map(r => ({ id: r.id, user: r.actor_id ?? "", at: r.created_at, detail: `${r.table_name}: ${r.action}` }));
    }
    const { data, error } = await supabase.from("punch_events").select("id,user_id,created_at,action,success,flags").lt("created_at", cutoff).order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id, user: r.user_id, at: r.created_at, detail: `${r.action} · ${r.success ? "Saved" : "Blocked"} · ${r.flags.join(", ")}` }));
  } });
  async function prepare(ids: string[]) {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_cleanup_records", { _kind: kind, _ids: ids, _preview: true });
      if (error) throw error;
      const result = data as { count: number; linked_outings: number };
      if (!result.count) throw new Error("No deletable records selected. Active records and protected records are kept.");
      setConfirmation(""); setPreview({ ...result, ids });
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }
  async function remove() {
    if (!preview || confirmation !== "DELETE") return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_cleanup_records", { _kind: kind, _ids: preview.ids, _preview: false });
      if (error) throw error;
      toast.success(`${(data as { count: number }).count} records deleted`);
      setPreview(undefined); setSelected([]);
      await qc.invalidateQueries();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }
  function exportRows() {
    const blob = new Blob([JSON.stringify(rows.data ?? [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `pome-${kind}-${before}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="mt-6 space-y-4">
    <h2 className="text-2xl">Data cleanup</h2>
    <p className="text-sm text-muted-foreground">Choose old or dummy records carefully. Active timesheets, open outings, accounts, device approvals and the last 30 days of changes are protected. Nothing is deleted automatically.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">Records<select aria-label="Cleanup category" className="block h-9 rounded-md border bg-background px-3" value={kind} onChange={e => { setKind(e.target.value as Kind); setSelected([]); }}>
        {Object.entries(categories).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      <label className="space-y-1 text-sm">Before date<Input aria-label="Before date" type="date" value={before} onChange={e => { setBefore(e.target.value); setSelected([]); }} /></label>
      <Button variant="outline" onClick={exportRows} disabled={!rows.data?.length}><Download /> Export displayed list</Button>
      <Button variant="destructive" disabled={busy || !selected.length} onClick={() => prepare(selected)}><Trash2 /> Delete selected ({selected.length})</Button>
    </div>
    <p className="text-xs text-muted-foreground">Up to 500 records per batch. Deleting timesheets also deletes their linked outings. Deleting change history removes its undo option. Exported lists are references, not restorable backups.</p>
    {rows.isError && <div role="alert">Could not load records. <Button variant="outline" onClick={() => rows.refetch()}>Retry</Button></div>}
    <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3"><Checkbox aria-label="Select all displayed" checked={!!rows.data?.length && selected.length === rows.data.length} onCheckedChange={on => setSelected(on ? (rows.data ?? []).map(r => r.id) : [])} /></th><th>Date</th><th>Employee / admin</th><th>Record</th><th /></tr></thead><tbody>
      {(rows.data ?? []).map(r => <tr key={r.id} className="border-b"><td className="p-3"><Checkbox aria-label={`Select ${r.id}`} checked={selected.includes(r.id)} onCheckedChange={on => setSelected(on ? [...selected, r.id] : selected.filter(id => id !== r.id))} /></td><td className="whitespace-nowrap">{fmtDate(r.at)} {fmtTime(r.at)}</td><td>{names[r.user] ?? "System"}</td><td className="p-3">{r.detail}</td><td><Button variant="ghost" size="icon" aria-label={`Delete ${r.id}`} disabled={busy} onClick={() => prepare([r.id])}><Trash2 /></Button></td></tr>)}
      {!rows.data?.length && <tr><td colSpan={5} className="p-4 text-muted-foreground">{rows.isPending ? "Loading…" : "No records before this date."}</td></tr>}
    </tbody></table></div>
    <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(undefined); }}><DialogContent><DialogHeader><DialogTitle>Delete {preview?.count} records?</DialogTitle><DialogDescription>This permanently removes selected {categories[kind].toLowerCase()}{preview?.linked_outings ? ` and ${preview.linked_outings} linked outings` : ""}. Other records are kept. This cannot be reliably undone.</DialogDescription></DialogHeader>
      <label className="space-y-2 text-sm">Type DELETE to confirm<Input aria-label="Type DELETE to confirm" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setPreview(undefined)}>Cancel</Button><Button variant="destructive" disabled={busy || confirmation !== "DELETE"} onClick={remove}>{busy ? "Deleting…" : "Delete permanently"}</Button></div>
    </DialogContent></Dialog>
  </section>;
}
