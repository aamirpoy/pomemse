import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtTime } from "@/lib/time";

const TABLES: Record<string, string> = {
  attendance: "Time record",
  profiles: "Employee details",
  user_roles: "Access role",
  office_settings: "Office settings",
};
const HIDE = new Set(["id", "updated_at", "created_at"]);

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return fmtDate(iso);
}

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) return `${fmtDate(v)} ${fmtTime(v)}`;
  return String(v);
}

function changes(o: any, n: any) {
  const keys = Array.from(new Set([...Object.keys(o ?? {}), ...Object.keys(n ?? {})])).filter((k) => !HIDE.has(k));
  return keys
    .filter((k) => JSON.stringify(o?.[k] ?? null) !== JSON.stringify(n?.[k] ?? null))
    .map((k) => ({ k: k.replace(/_/g, " "), from: o ? show(o[k]) : null, to: n ? show(n[k]) : null }));
}

type Entry = any;

export function AuditLog({ names }: { names: Record<string, string> }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["audit_log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log" as any).select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as Entry[];
    },
  });

  const [person, setPerson] = useState("all");
  const [type, setType] = useState("all");

  const people = useMemo(() => {
    const ids = new Set<string>();
    for (const r of data) {
      if (r.target_user_id) ids.add(r.target_user_id);
      if (r.actor_id) ids.add(r.actor_id);
    }
    return Array.from(ids).sort((a, b) => (names[a] ?? "").localeCompare(names[b] ?? ""));
  }, [data, names]);

  const filtered = useMemo(
    () =>
      data.filter((r) => {
        if (type === "others" && !(r.table_name === "user_roles" || r.table_name === "profiles")) return false;
        if (type === "time" && r.table_name !== "attendance") return false;
        if (type === "office" && r.table_name !== "office_settings") return false;
        if (person !== "all" && r.actor_id !== person && r.target_user_id !== person) return false;
        return true;
      }),
    [data, person, type]
  );

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const r of filtered) {
      const k = dayKey(r.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!data.length) {
    return <p className="py-8 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No admin changes recorded yet."}</p>;
  }

  return (
    <div className="space-y-3 py-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Filter by person"
        >
          <option value="all">Everyone</option>
          {people.map((id) => (
            <option key={id} value={id}>
              {names[id] ?? "Removed employee"}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Filter by change type"
        >
          <option value="all">All changes</option>
          <option value="time">Time records</option>
          <option value="others">Employees & access</option>
          <option value="office">Office settings</option>
        </select>
        {(person !== "all" || type !== "all") && (
          <button
            onClick={() => {
              setPerson("all");
              setType("all");
            }}
            className="h-9 rounded-md border px-3 text-sm text-muted-foreground hover:bg-accent"
          >
            Clear filters
          </button>
        )}
      </div>

      {!filtered.length && <p className="py-8 text-sm text-muted-foreground">No changes match these filters.</p>}

      {groups.map(([day, rows]) => (
        <div key={day} className="space-y-2">
          <h3 className="sticky top-0 z-10 -mx-2 bg-background px-2 py-1.5 text-sm font-semibold">
            {dayLabel(rows[0].created_at)}
            <span className="ml-2 font-normal text-muted-foreground">
              {rows.length} change{rows.length === 1 ? "" : "s"}
            </span>
          </h3>
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {r.actor_id ? names[r.actor_id] ?? "Admin" : "Admin (account tools)"}{" "}
                  <span className="font-normal text-muted-foreground">
                    {r.action === "insert" ? "added" : r.action === "delete" ? "deleted" : "changed"}
                  </span>{" "}
                  {TABLES[r.table_name] ?? r.table_name}
                  {r.target_user_id && (
                    <>
                      {" for "}
                      <span className="font-semibold">{names[r.target_user_id] ?? "a removed employee"}</span>
                    </>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{fmtTime(r.created_at)}</span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs">
                {changes(r.old_data, r.new_data).map((c) => (
                  <li key={c.k}>
                    <span className="capitalize text-muted-foreground">{c.k}:</span>{" "}
                    {c.from !== null && <span className="line-through text-muted-foreground">{c.from}</span>}
                    {c.from !== null && c.to !== null && " → "}
                    {c.to !== null && <span className="font-medium">{c.to}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
