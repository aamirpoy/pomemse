import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmtDuration, totalMs, type AttendanceRow } from "@/lib/time";
import { summarize } from "@/lib/analytics";

type P = { id: string; full_name: string };

export function Analytics({ profiles }: { profiles: P[] }) {
  const [days, setDays] = useState(30);
  const [withBreak, setWithBreak] = useState(true);
  const rows = useQuery({
    queryKey: ["att-analytics", days],
    queryFn: async () => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1));
      return ((await supabase.from("attendance").select("*").gte("check_in_at", d.toISOString())).data ?? []) as AttendanceRow[];
    },
  });
  const data = rows.data ?? [];
  const s = summarize(data, days);
  const perEmp = profiles.map((p) => {
    const e = s.perUser.get(p.id);
    const ms = totalMs(data.filter((r) => r.user_id === p.id), withBreak);
    return { name: p.full_name, hours: +(ms / 3600000).toFixed(1), days: e?.days ?? 0, avgIn: e?.avgIn ?? "—", avgDay: e?.days ? fmtDuration(ms / e.days) : "—" };
  }).sort((a, b) => b.hours - a.hours);
  const team = totalMs(data, withBreak);
  const stat = "rounded-xl border bg-card p-4 shadow-soft";
  const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 } };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex gap-2">
        {[7, 30, 90].map((n) => (
          <button key={n} onClick={() => setDays(n)}
            className={`rounded-full px-3 py-1 text-sm ${days === n ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Last {n} days</button>
        ))}
        <span className="mx-2 w-px bg-border" />
        {[[true, "After 1h break"], [false, "Without break"]].map(([v, l]) => (
          <button key={String(v)} onClick={() => setWithBreak(v as boolean)}
            className={`rounded-full px-3 py-1 text-sm ${withBreak === v ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{l as string}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={stat}><div className="text-sm text-muted-foreground">Total hours</div><div className="font-mono text-2xl">{fmtDuration(team)}</div></div>
        <div className={stat}><div className="text-sm text-muted-foreground">Avg per day</div><div className="font-mono text-2xl">{fmtDuration(s.presentDays ? team / s.presentDays : 0)}</div></div>
        <div className={stat}><div className="text-sm text-muted-foreground">Attendance days</div><div className="font-mono text-2xl">{s.presentDays}</div></div>
        <div className={stat}><div className="text-sm text-muted-foreground">Open check-ins</div><div className="font-mono text-2xl">{data.filter((r) => !r.check_out_at).length}</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={stat}>
          <h3 className="mb-2 font-medium">Team hours per day</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={s.daily}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} /><Tooltip {...tip} />
              <Line type="monotone" dataKey="hours" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className={stat}>
          <h3 className="mb-2 font-medium">Hours by employee</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={perEmp}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip {...tip} />
              <Bar dataKey="hours" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="p-4">Employee</th><th>Days present</th><th>Attendance</th><th>Avg check-in</th><th>Avg per day</th><th className="pr-4 text-right">Total hours</th></tr></thead>
          <tbody>
            {perEmp.map((e) => (
              <tr key={e.name} className="border-b last:border-0">
                <td className="p-4 font-medium">{e.name}</td><td>{e.days}</td>
                <td>{Math.round((e.days / days) * 100)}%</td><td>{e.avgIn}</td><td>{e.avgDay}</td>
                <td className="pr-4 text-right font-mono">{e.hours}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}
