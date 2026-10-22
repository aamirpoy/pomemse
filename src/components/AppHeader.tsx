import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/pme-logo.png.asset.json";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { useLang } from "@/lib/i18n";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in");
      const id = u.user.id;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
      ]);
      return {
        id,
        email: u.user.email ?? "",
        profile,
        isAdmin: (roles ?? []).some((r) => r.role === "admin"),
      };
    },
  });
}

export function AppHeader() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t, lang, setLang, available } = useLang();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const linkCls = "rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground";
  const active = { className: "rounded-full px-3 py-1.5 text-sm bg-secondary text-foreground" };

  return (
    <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src={logoAsset.url} alt="POME — Pioneers of the Middle East" className="h-8 w-auto" />
        </Link>
        <nav className="flex gap-1">
          <Link to="/dashboard" className={linkCls} activeProps={active}>{t("My time")}</Link>
          {me?.isAdmin && (
            <Link to="/admin" className={linkCls} activeProps={active}>{t("Admin")}</Link>
          )}
        </nav>
        <div className="ms-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {me?.profile?.full_name || me?.email}
          </span>
          {available && (
            <Button variant="outline" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={t("Language")}>
              {lang === "ar" ? "English" : "العربية"}
            </Button>
          )}
          <ChangePasswordDialog />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label={t("Sign out")}>
            <LogOut />
          </Button>
        </div>
      </div>
    </header>
  );
}
