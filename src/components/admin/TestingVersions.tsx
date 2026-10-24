import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/app-toast";
import { ShieldCheck, Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FEATURE_VERSIONS, eligibleFor, hasVersionAccess, type FeatureKey } from "@/lib/feature-versions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Person = { id: string; full_name: string; employee_code: string | null };

export function TestingVersions({ profiles, adminIds }: { profiles: Person[]; adminIds: Set<string> }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FeatureKey>(FEATURE_VERSIONS[0].key);
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
  const v = FEATURE_VERSIONS.find((x) => x.key === selected) ?? FEATURE_VERSIONS[0];
  const adminOnly = v.audience === "admin";
  const groupLabel = adminOnly ? "all admins" : "everyone";

  const stats = (key: FeatureKey, audience: "everyone" | "admin") => {
    const people = eligibleFor(audience, profiles, adminIds);
    return { on: people.filter((p) => hasVersionAccess(key, p.id, access, rollouts)).length, total: people.length };
  };

  const people = useMemo(() => {
    const q = search.toLowerCase();
    return eligibleFor(v.audience, profiles, adminIds).filter((p) => `${p.full_name} ${p.employee_code ?? ""}`.toLowerCase().includes(q));
  }, [v.audience, profiles, adminIds, search]);

  async function save(enabled: boolean, userId?: string) {
    if (!userId && !confirm(`${enabled ? "Turn on" : "Turn off"} "${v.name}" for ${groupLabel}? This replaces individual choices for this update.`)) return;
    setBusy(true);
    try {
      const { error } = userId
        ? await supabase.from("feature_access").upsert({ feature_key: v.key, user_id: userId, enabled })
        : await supabase.rpc("set_version_everyone", { _feature: v.key, _enabled: enabled });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["version-settings"] }),
        qc.invalidateQueries({ queryKey: ["my-feature-versions"] }),
      ]);
      toast.success("Saved");
    } catch (e) { toast.error(e); }
    finally { setBusy(false); }
  }

  const disabled = busy || settings.isPending || settings.isError;
  const s = stats(v.key, v.audience);
  const allOn = rollouts.some((r) => r.feature_key === v.key && r.enabled_all);

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="text-2xl">Testing versions</h2>
        <p className="text-sm text-muted-foreground">Pick an update, then choose who gets it. Nothing changes for anyone until you switch it on.</p>
      </div>
      {settings.isError && <div className="flex items-center gap-3 text-destructive">Could not load settings.<Button variant="outline" onClick={() => settings.refetch()}>Retry</Button></div>}
      <section className="border-y py-4 text-sm">
        <h3 className="font-semibold">Attendance reliability · active for everyone</h3>
        <p className="mt-1 text-muted-foreground">Fresh location for each action, location checks on the server, clear saved / blocked results, and silent security records. Device registration is not required unless V4 is enabled.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <nav className="space-y-2" aria-label="Updates">
          {FEATURE_VERSIONS.map((x) => {
            const st = stats(x.key, x.audience);
            const active = x.key === selected;
            return (
              <div key={x.key}>
              {(x.version === "V1" || x.version === "V3" || x.version === "V4" || x.version === "V6" || x.version === "V7") && <h3 className="px-1 pb-2 pt-3 text-xs font-semibold uppercase text-muted-foreground">{x.version === "V1" ? "Location & monitoring" : x.version === "V3" ? "Employee notes" : x.version === "V4" ? "Identity protection · optional" : x.version === "V6" ? "Language" : "Admin recovery"}</h3>}
              <Button key={x.key} type="button" variant="outline" onClick={() => { setSelected(x.key); setSearch(""); }}
                className={`h-auto w-full flex-col items-stretch whitespace-normal rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "bg-card hover:bg-secondary"}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-primary">{x.version}</span>
                  <span className="font-medium">{x.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {x.audience === "admin" ? <><ShieldCheck className="size-3.5" /> Admins only</> : <><Users className="size-3.5" /> All staff</>}
                  <span className="ms-auto">{settings.isPending ? "…" : st.on === 0 ? "Off" : `${st.on}/${st.total} on`}</span>
                </div>
              </Button>
              </div>
            );
          })}
        </nav>

        <section className="rounded-lg border bg-card">
          <div className="space-y-3 border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-primary">{v.version}</span>
              <h3 className="text-lg font-semibold">{v.name}</h3>
              <Badge variant="secondary">{adminOnly ? "Admins only" : "All staff"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{v.detail}</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">{s.on} of {s.total} {adminOnly ? "admins" : "people"} have it{allOn ? ` · on for ${groupLabel} by default` : ""}</span>
              <div className="ms-auto flex gap-2">
                <Button size="sm" disabled={disabled} onClick={() => save(true)}>Turn on for {groupLabel}</Button>
                <Button size="sm" variant="outline" disabled={disabled} onClick={() => save(false)}>Turn off for {groupLabel}</Button>
              </div>
            </div>
          </div>
          <div className="p-4">
            <div className="relative mb-3 max-w-sm">
              <Search className="absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input type="search" className="ps-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find by name or employee ID" aria-label="Find person" />
            </div>
            <ul className="divide-y">
              {people.map((p) => {
                const on = hasVersionAccess(v.key, p.id, access, rollouts);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.full_name}{adminIds.has(p.id) && <Badge variant="outline" className="ms-2">Admin</Badge>}</div>
                      <div className="text-xs text-muted-foreground">{p.employee_code}</div>
                    </div>
                    <span className={`ms-auto text-xs ${on ? "text-primary" : "text-muted-foreground"}`}>{on ? "On" : "Off"}</span>
                    <Switch aria-label={`${v.name} for ${p.full_name}`} disabled={disabled} checked={on} onCheckedChange={(c) => save(c, p.id)} />
                  </li>
                );
              })}
            </ul>
            {!people.length && <div className="py-6 text-sm text-muted-foreground">{search ? "No one matches that search." : adminOnly ? "No admins yet." : "No employees yet."}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
