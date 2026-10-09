import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Trash2, KeyRound, Pencil, Plus } from "lucide-react";
import { Analytics } from "@/components/admin/Analytics";
import { AuditLog } from "@/components/admin/AuditLog";
import { EmployeeDialog, RecordDialog } from "@/components/admin/EditDialogs";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader, useMe } from "@/components/AppHeader";
import { isOwnerEmail } from "@/lib/owner";
import { createEmployee, deleteEmployee, resetEmployeePassword } from "@/lib/admin.functions";
import { fmtDate, fmtDuration, fmtTime, workedMs, totalMs, type AttendanceRow } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — POME" },
      { name: "description", content: "Manage employees, office location and timesheets." },
      { property: "og:title", content: "Admin — POME" },
      { property: "og:description", content: "Manage employees, office location and timesheets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

type Profile = { id: string; full_name: string; employee_code: string | null; department: string | null; email: string | null };

function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => ((await supabase.from("profiles").select("*").order("full_name")).data ?? []) as Profile[],
  });
}

function HistoryTab() {
  const { data = [] } = useProfiles();
  return <AuditLog names={Object.fromEntries(data.map((p) => [p.id, p.full_name]))} />;
}

function AdminPage() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <div className="min-h-screen"><AppHeader /></div>;
  if (!me?.isAdmin)
    return (
      <div className="min-h-screen"><AppHeader />
        <div className="p-10 text-center text-muted-foreground">
          Admins only. <Link to="/dashboard" className="text-primary underline">Back to my time</Link>
        </div>
      </div>
    );
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-4xl">Admin</h1>
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="office">Office</TabsTrigger>
            <TabsTrigger value="history">Change log</TabsTrigger>
          </TabsList>
          <TabsContent value="today"><Today /></TabsContent>
          <TabsContent value="progress"><ProgressTab /></TabsContent>
          <TabsContent value="timesheets"><Timesheets /></TabsContent>
          <TabsContent value="employees"><Employees selfId={me.id} /></TabsContent>
          <TabsContent value="office"><Office /></TabsContent>
          <TabsContent value="history"><HistoryTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

const card = "mt-4 rounded-xl border bg-card shadow-soft";

function ProgressTab() {
  const profiles = useProfiles();
  return <Analytics profiles={profiles.data ?? []} />;
}

function useAdminIds() {
  return useQuery({
    queryKey: ["admin-ids"],
    queryFn: async () => new Set(((await supabase.from("user_roles").select("user_id").eq("role", "admin")).data ?? []).map((r) => r.user_id)),
  });
}

function Today() {
  const profiles = useProfiles();
  const rows = useQuery({
    queryKey: ["att-today"],
    refetchInterval: 30000,
    queryFn: async () => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return ((await supabase.from("attendance").select("*").gte("check_in_at", d.toISOString())).data ?? []) as AttendanceRow[];
    },
  });
  return (
    <div className={card}>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b"><th className="p-4">Employee</th><th>Status</th><th>First in</th><th>Last out</th><th className="pr-4 text-right">Hours</th></tr>
        </thead>
        <tbody>
          {(profiles.data ?? []).map((p) => {
            const mine = (rows.data ?? []).filter((r) => r.user_id === p.id).sort((a, b) => a.check_in_at.localeCompare(b.check_in_at));
            const open = mine.some((r) => !r.check_out_at);
            const last = mine[mine.length - 1];
            return (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-4"><div className="font-medium">{p.full_name}</div><div className="text-xs text-muted-foreground">{p.employee_code}</div></td>
                <td>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${open ? "bg-success text-success-foreground" : mine.length ? "bg-secondary" : "bg-muted text-muted-foreground"}`}>
                    {open ? "In office" : mine.length ? "Checked out" : "Absent"}
                  </span>
                </td>
                <td>{mine[0] ? fmtTime(mine[0].check_in_at) : "—"}</td>
                <td>{last?.check_out_at ? fmtTime(last.check_out_at) : "—"}</td>
                <td className="pr-4 text-right font-mono">{fmtDuration(totalMs(mine, true))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Timesheets() {
  const profiles = useProfiles();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [who, setWho] = useState("all");

  const rows = useQuery({
    queryKey: ["att-range", from, to, who],
    queryFn: async () => {
      let q = supabase.from("attendance").select("*")
        .gte("check_in_at", new Date(from + "T00:00:00").toISOString())
        .lte("check_in_at", new Date(to + "T23:59:59").toISOString())
        .order("check_in_at", { ascending: false });
      if (who !== "all") q = q.eq("user_id", who);
      return ((await q).data ?? []) as AttendanceRow[];
    },
  });
  const name = (id: string) => profiles.data?.find((p) => p.id === id)?.full_name ?? "—";
  const [withBreak, setWithBreak] = useState(true);
  const totals = new Map<string, number>();
  [...new Set((rows.data ?? []).map((r) => r.user_id))].forEach((id) =>
    totals.set(id, totalMs((rows.data ?? []).filter((r) => r.user_id === id), withBreak)));

  function exportCsv() {
    const lines = [["Employee", "Employee ID", "Date", "Check in", "Check out", "Hours", "In distance (m)", "Out distance (m)", "Check-in note", "Check-out note"]];
    (rows.data ?? []).forEach((r) => {
      const p = profiles.data?.find((x) => x.id === r.user_id);
      lines.push([p?.full_name ?? "", p?.employee_code ?? "", new Date(r.check_in_at).toLocaleDateString(),
        fmtTime(r.check_in_at), r.check_out_at ? fmtTime(r.check_out_at) : "",
        (workedMs(r) / 3600000).toFixed(2), String(r.check_in_distance_m ?? ""), String(r.check_out_distance_m ?? ""),
        r.check_in_note ?? "", r.check_out_note ?? ""]);
    });
    const csv = lines.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `timesheet_${from}_${to}.csv`;
    a.click();
  }

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>Employee</Label>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Everyone</option>
            {(profiles.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div className="flex rounded-full bg-secondary p-1 text-sm">
          {[[true, "After 1h break"], [false, "Without break"]].map(([v, l]) => (
            <button key={String(v)} onClick={() => setWithBreak(v as boolean)}
              className={`rounded-full px-3 py-1 ${withBreak === v ? "bg-primary text-primary-foreground" : ""}`}>{l as string}</button>
          ))}
        </div>
        <RecordDialog profiles={profiles.data ?? []} trigger={<Button className="ml-auto"><Plus /> Add record</Button>} />
        <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...totals.entries()].map(([id, ms]) => (
          <div key={id} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="text-sm text-muted-foreground">{name(id)}</div>
            <div className="font-mono text-2xl">{fmtDuration(ms)}</div>
          </div>
        ))}
      </div>
      <div className={card}>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b"><th className="p-4">Employee</th><th>Date</th><th>In</th><th>Out</th><th>Distance</th><th>Notes</th><th className="text-right">Hours</th><th className="pr-4"></th></tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-4 font-medium">{name(r.user_id)}</td>
                <td>{fmtDate(r.check_in_at)}</td>
                <td>{fmtTime(r.check_in_at)}</td>
                <td>{r.check_out_at ? fmtTime(r.check_out_at) : <span className="text-success">open</span>}</td>
                <td className="text-muted-foreground">{r.check_in_distance_m ?? "—"} m</td>
                <td className="max-w-xs text-xs">
                  {r.check_in_note && <div><span className="font-semibold">In:</span> {r.check_in_note}</div>}
                  {r.check_out_note && <div><span className="font-semibold">Out:</span> {r.check_out_note}</div>}
                  {!r.check_in_note && !r.check_out_note && <span className="text-muted-foreground">—</span>}
                </td>
                <td className="text-right font-mono">{fmtDuration(workedMs(r))}</td>
                <td className="pr-2 text-right">
                  <RecordDialog rec={r} profiles={profiles.data ?? []} trigger={<Button variant="ghost" size="icon" aria-label="Edit record"><Pencil /></Button>} />
                </td>
              </tr>
            ))}
            {rows.data?.length === 0 && <tr><td colSpan={8} className="p-4 text-muted-foreground">No records in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Employees({ selfId }: { selfId: string }) {
  const qc = useQueryClient();
  const profiles = useProfiles();
  const adminIds = useAdminIds();
  const create = useServerFn(createEmployee);
  const remove = useServerFn(deleteEmployee);
  const reset = useServerFn(resetEmployeePassword);
  const { data: me } = useMe();
  const empty = { full_name: "", email: "", password: "", employee_code: "", department: "", is_admin: false };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ data: f });
      toast.success(`${f.full_name} added. Share their email and password with them.`);
      setF(empty);
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className={`${card} space-y-3 p-5`}>
        <h2 className="text-xl">Add employee</h2>
        {([["full_name", "Full name", "text"], ["email", "Email", "email"], ["password", "Temporary password", "text"],
          ["employee_code", "Employee ID", "text"], ["department", "Department", "text"]] as const).map(([k, l, t]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={k}>{l}</Label>
            <Input id={k} type={t} required={k === "full_name" || k === "email" || k === "password"}
              minLength={k === "password" ? 8 : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm">
          {isOwnerEmail(me?.email) && <>
          <Checkbox checked={f.is_admin} onCheckedChange={(v) => setF({ ...f, is_admin: !!v })} /> Make admin</>}
        </label>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Adding…" : "Add employee"}</Button>
      </form>
      <div className={card}>
        <ul className="divide-y">
          {(profiles.data ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-4">
              <div className="flex-1">
                <div className="font-medium">{p.full_name} {p.employee_code && <span className="text-xs text-muted-foreground">#{p.employee_code}</span>} {adminIds.data?.has(p.id) && <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">Admin</span>}</div>
                <div className="text-sm text-muted-foreground">{p.email}{p.department && ` · ${p.department}`}</div>
              </div>
              <EmployeeDialog p={p} isAdmin={!!adminIds.data?.has(p.id)} trigger={<Button variant="ghost" size="icon" aria-label="Edit employee"><Pencil /></Button>} />
              <Button variant="ghost" size="icon" aria-label="Reset password" onClick={async () => {
                const pw = prompt(`New password for ${p.full_name} (min 8 characters)`);
                if (!pw) return;
                try { await reset({ data: { id: p.id, password: pw } }); toast.success("Password updated"); }
                catch (e: any) { toast.error(e.message); }
              }}><KeyRound /></Button>
              {p.id !== selfId && (
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={async () => {
                  if (!confirm(`Remove ${p.full_name}? Their attendance history will be deleted.`)) return;
                  try { await remove({ data: { id: p.id } }); qc.invalidateQueries({ queryKey: ["profiles"] }); toast.success("Removed"); }
                  catch (e: any) { toast.error(e.message); }
                }}><Trash2 /></Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Office() {
  const qc = useQueryClient();
  const office = useQuery({
    queryKey: ["office"],
    queryFn: async () => (await supabase.from("office_settings").select("*").eq("id", 1).single()).data,
  });
  const [f, setF] = useState({ name: "", latitude: "", longitude: "", radius_m: "" });
  useEffect(() => {
    if (office.data) setF({ name: office.data.name, latitude: String(office.data.latitude), longitude: String(office.data.longitude), radius_m: String(office.data.radius_m) });
  }, [office.data]);

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const { error } = await supabase.from("office_settings").update({
      name: f.name, latitude: Number(f.latitude), longitude: Number(f.longitude), radius_m: Number(f.radius_m), updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    toast.success("Office location saved");
    qc.invalidateQueries({ queryKey: ["office"] });
  }

  return (
    <form onSubmit={save} className={`${card} max-w-lg space-y-4 p-5`}>
      <h2 className="text-xl">Office location</h2>
      <p className="text-sm text-muted-foreground">Employees can only check in or out within this radius.</p>
      <div className="space-y-1"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Latitude</Label><Input required value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} /></div>
        <div className="space-y-1"><Label>Longitude</Label><Input required value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} /></div>
      </div>
      <div className="space-y-1"><Label>Allowed radius (meters)</Label><Input type="number" min={10} required value={f.radius_m} onChange={(e) => setF({ ...f, radius_m: e.target.value })} /></div>
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={() => navigator.geolocation.getCurrentPosition(
          (p) => setF({ ...f, latitude: String(p.coords.latitude), longitude: String(p.coords.longitude) }),
          (e) => toast.error(e.message), { enableHighAccuracy: true })}>Use my current location</Button>
        <Button asChild variant="ghost"><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${f.latitude},${f.longitude}`}>View on map</a></Button>
      </div>
    </form>
  );
}
