import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapAdmin, getSetupStatus } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Punchline" },
      { name: "description", content: "Sign in to check in, check out and view your timesheet." },
      { property: "og:title", content: "Sign in — Punchline" },
      { property: "og:description", content: "Sign in to check in, check out and view your timesheet." },
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
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden bg-hero p-10 text-primary-foreground md:flex md:flex-col md:justify-between">
        <Link to="/" className="font-display text-2xl">Punchline</Link>
        <p className="font-display text-4xl leading-tight">
          Your day starts the moment you arrive.
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-3xl">{needsSetup ? "Create admin account" : "Sign in"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {needsSetup
                ? "First-time setup. This account will manage employees."
                : "Use the login details provided by your manager."}
            </p>
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
