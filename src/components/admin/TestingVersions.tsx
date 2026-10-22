import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FEATURE_VERSIONS, hasVersionAccess, type FeatureKey } from "@/lib/feature-versions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TestingVersions({ profiles }: { profiles: { id: string; full_name: string; employee_code: string | null }[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const settings = useQuery({
    queryKey: ["version-settings"],
    refetchInterval: 30000,
    queryFn: async () => {
      const [access, rollouts] = await Promise.all([
        supabase.from("feature_access").select("*"),
        supabase.from("feature_rollouts").select("*"),
      ]);
      if (access.error) throw access.error;
      if (rollouts.error) throw rollouts.error;
      return { access: access.data, rollouts: rollouts.data };
    },
  });
  const access = settings.data?.access ?? [];
  const rollouts = settings.data?.rollouts ?? [];
  async function save(key: FeatureKey, enabled: boolean, userId?: string) {
    if (!userId && !confirm(`${enabled ? "Enable" : "Turn off"} ${FEATURE_VERSIONS.find((v) => v.key === key)?.name} for everyone? This replaces individual selections for this update.`)) return;
    setBusy(true);
    try {
      const { error } = userId
        ? await supabase.from("feature_access").upsert({ feature_key: key, user_id: userId, enabled })
        : await supabase.rpc("set_version_everyone", { _feature: key, _enabled: enabled });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["version-settings"] }),
        qc.invalidateQueries({ queryKey: ["my-feature-versions"] }),
      ]);
      toast.success("Update access saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save update access"); }
    finally { setBusy(false); }
  }
  const disabled = busy || settings.isPending || settings.isError;
  return (
    <div className="mt-6 space-y-6">
      <h2 className="text-2xl">Testing versions</h2>
      {settings.isError && <div className="flex items-center gap-3 text-destructive">Could not load update access.<Button variant="outline" onClick={() => settings.refetch()}>Retry</Button></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        {FEATURE_VERSIONS.map((v) => {
          const count = profiles.filter((p) => hasVersionAccess(v.key, p.id, access, rollouts)).length;
          const all = rollouts.some((r) => r.feature_key === v.key && r.enabled_all);
          return <section key={v.key} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="font-mono text-xs text-primary">{v.version}</div>
            <h3 className="text-lg font-semibold">{v.name}</h3>
            <div className="text-sm text-muted-foreground">{v.detail}</div>
            <div className="mt-auto text-sm">{settings.isPending ? "Loading…" : `${count} of ${profiles.length} employees · ${all ? "Everyone by default" : "Selected employees only"}`}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={disabled} onClick={() => save(v.key, true)}>Enable for everyone</Button>
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => save(v.key, false)}>Turn off for everyone</Button>
            </div>
          </section>;
        })}
      </div>
      <div className="max-w-sm space-y-2"><Label htmlFor="testing-search">Find employee</Label><Input id="testing-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or employee ID" /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b text-left"><th className="py-3 pr-4">Employee</th>{FEATURE_VERSIONS.map((v) => <th key={v.key} className="px-3 py-3"><span className="font-mono text-primary">{v.version}</span><div>{v.name}</div></th>)}</tr></thead>
          <tbody>{profiles.filter((p) => `${p.full_name} ${p.employee_code ?? ""}`.toLowerCase().includes(search.toLowerCase())).map((p) => <tr key={p.id} className="border-b">
            <td className="py-4 pr-4 font-medium">{p.full_name}<div className="text-xs text-muted-foreground">{p.employee_code}</div></td>
            {FEATURE_VERSIONS.map((v) => <td key={v.key} className="px-3 py-4"><Checkbox aria-label={`${v.version} ${v.name} for ${p.full_name}`} disabled={disabled} checked={hasVersionAccess(v.key, p.id, access, rollouts)} onCheckedChange={(on) => save(v.key, on === true, p.id)} /></td>)}
          </tr>)}</tbody>
        </table>
        {!profiles.length && <div className="py-6 text-muted-foreground">No employees yet.</div>}
      </div>
    </div>
  );
}