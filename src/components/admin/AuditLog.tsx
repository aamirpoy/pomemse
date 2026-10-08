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

export function AuditLog({ names }: { names: Record<string, string> }) {
  const { data = [] } = useQuery({
    queryKey: ["audit_log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log" as any).select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data as any[];
    },
  });

  if (!data.length) return <p className="py-8 text-sm text-muted-foreground">No admin changes recorded yet.</p>;

  return (
    <div className="space-y-3 py-4">
      {data.map((r) => (
        <div key={r.id} className="rounded-md border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              {r.actor_id ? names[r.actor_id] ?? "Admin" : "Admin (account tools)"}{" "}
              <span className="font-normal text-muted-foreground">
                {r.action === "insert" ? "added" : r.action === "delete" ? "deleted" : "changed"}
              </span>{" "}
              {TABLES[r.table_name] ?? r.table_name}
              {r.target_user_id && <> for <span className="font-semibold">{names[r.target_user_id] ?? "a removed employee"}</span></>}
            </span>
            <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)} {fmtTime(r.created_at)}</span>
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
  );
}
