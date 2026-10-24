import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/app-toast";
import { supabase } from "@/integrations/supabase/client";
import { setAdminRole } from "@/lib/admin.functions";
import { useMe } from "@/components/AppHeader";
import { isOwnerEmail } from "@/lib/owner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

type Rec = { id?: string; user_id: string; check_in_at: string; check_out_at: string | null; admin_note?: string | null };

export function RecordDialog({ rec, profiles, trigger }: { rec?: Rec; profiles: { id: string; full_name: string }[]; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ user_id: "", inAt: "", outAt: "", note: "" });

  function onOpen(o: boolean) {
    setOpen(o);
    if (o) setF({ user_id: rec?.user_id ?? profiles[0]?.id ?? "", inAt: toLocal(rec?.check_in_at ?? null), outAt: toLocal(rec?.check_out_at ?? null), note: rec?.admin_note ?? "" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const inAt = new Date(f.inAt).toISOString();
    const outAt = f.outAt ? new Date(f.outAt).toISOString() : null;
    if (outAt && outAt <= inAt) { toast.error("Check-out must be after check-in"); return; }
    const payload = { user_id: f.user_id, check_in_at: inAt, check_out_at: outAt, admin_note: f.note.trim() || null };
    const { error } = rec?.id
      ? await supabase.from("attendance").update(payload).eq("id", rec.id)
      : await supabase.from("attendance").insert(payload);
    if (error) { toast.error(error.message); return; }
    if (rec?.id && !f.note.trim()) {
      const { error: noteError } = await supabase.rpc("clear_private_attendance_note", { _attendance: rec.id });
      if (noteError) { toast.error("Time saved, but the admin note could not be cleared. Please retry."); return; }
    }
    toast.success(rec?.id ? "Record updated" : "Record added");
    qc.invalidateQueries();
    setOpen(false);
  }

  async function remove() {
    if (!rec?.id || !confirm("Delete this record?")) return;
    const { error } = await supabase.from("attendance").delete().eq("id", rec.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Record deleted");
    qc.invalidateQueries();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{rec?.id ? "Edit time record" : "Add time record"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1">
            <Label>Employee</Label>
            <select disabled={!!rec?.id} className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Check in</Label><Input type="datetime-local" required value={f.inAt} onChange={(e) => setF({ ...f, inAt: e.target.value })} /></div>
          <div className="space-y-1"><Label>Check out (leave empty if still in)</Label><Input type="datetime-local" value={f.outAt} onChange={(e) => setF({ ...f, outAt: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>Admin note (optional · admins only)</Label>
            <textarea maxLength={500} rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Forgot to check out, corrected to 6 pm" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit">Save</Button>
            {rec?.id && <Button type="button" variant="destructive" onClick={remove}>Delete</Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Prof = { id: string; full_name: string; employee_code: string | null; department: string | null };

export function EmployeeDialog({ p, isAdmin, trigger }: { p: Prof; isAdmin: boolean; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const setRole = useServerFn(setAdminRole);
  const { data: me } = useMe();
  const owner = isOwnerEmail(me?.email);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ full_name: "", employee_code: "", department: "", admin: false });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({
      full_name: f.full_name, employee_code: f.employee_code || null, department: f.department || null,
    }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    try { if (f.admin !== isAdmin) await setRole({ data: { id: p.id, admin: f.admin } }); }
    catch (err: any) { { toast.error(err.message); return; } }
    toast.success("Employee updated");
    qc.invalidateQueries();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF({ full_name: p.full_name, employee_code: p.employee_code ?? "", department: p.department ?? "", admin: isAdmin }); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit employee</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1"><Label>Full name</Label><Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Employee ID</Label><Input value={f.employee_code} onChange={(e) => setF({ ...f, employee_code: e.target.value })} /></div>
          <div className="space-y-1"><Label>Department</Label><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
          {owner && <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.admin} onCheckedChange={(v) => setF({ ...f, admin: !!v })} /> Admin access</label>}
          <Button type="submit">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
