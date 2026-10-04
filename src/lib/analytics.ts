import { workedMs, type AttendanceRow } from "./time";

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Aggregates attendance into team totals, a daily series and per-employee stats. */
export function summarize(rows: AttendanceRow[], days: number, now = new Date()) {
  const daily = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    daily.set(dayKey(d.toISOString()), 0);
  }
  const perUser = new Map<string, { ms: number; days: number; avgIn: string }>();
  const userDays = new Map<string, Map<string, number>>(); // user -> day -> first check-in minutes
  let totalMs = 0;
  for (const r of rows) {
    const ms = workedMs(r, now.getTime());
    totalMs += ms;
    const k = dayKey(r.check_in_at);
    if (daily.has(k)) daily.set(k, daily.get(k)! + ms);
    const d = new Date(r.check_in_at);
    const mins = d.getHours() * 60 + d.getMinutes();
    const ud = userDays.get(r.user_id) ?? new Map();
    ud.set(k, Math.min(ud.get(k) ?? Infinity, mins));
    userDays.set(r.user_id, ud);
    const u = perUser.get(r.user_id) ?? { ms: 0, days: 0, avgIn: "—" };
    u.ms += ms;
    perUser.set(r.user_id, u);
  }
  let presentDays = 0;
  for (const [uid, ud] of userDays) {
    const u = perUser.get(uid)!;
    u.days = ud.size;
    presentDays += ud.size;
    const avg = Math.round([...ud.values()].reduce((a, b) => a + b, 0) / ud.size);
    u.avgIn = `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
  }
  return {
    totalMs,
    presentDays,
    perUser,
    daily: [...daily.entries()].map(([day, ms]) => ({ day: day.slice(5), hours: +(ms / 3600000).toFixed(1) })),
  };
}
