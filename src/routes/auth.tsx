import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/app-toast";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapAdmin, getSetupStatus } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoAsset from "@/assets/pme-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — POME" },
      { name: "description", content: "Sign in to check in, check out and view your timesheet." },
      { property: "og:title", content: "Sign in — POME" },
      { property: "og:description", content: "Sign in to check in, check out and view your timesheet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const status = useServerFn(getSetupStatus);
  const bootstrap = useServerFn(bootstrapAdmin);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
    status().then((s) => setNeedsSetup(s.needsSetup)).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (needsSetup) {
        await bootstrap({ data: { ...form, employee_code: "", department: "" } });
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) throw error;
      (await import("@/lib/session-expiry")).markLogin();
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center border-t-4 border-primary bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <Link to="/" className="mb-10 block">
            <img src={logoAsset.url} alt="POME — Pioneers of the Middle East" className="mx-auto h-auto w-64 max-w-full" />
          </Link>
          <div>
            <h1 className="text-2xl">{needsSetup ? "Create admin account" : "Sign in"}</h1>
          </div>
          {needsSetup && (
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" required value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={needsSetup ? 8 : 1}
              autoComplete={needsSetup ? "new-password" : "current-password"} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Please wait…" : needsSetup ? "Create & sign in" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
