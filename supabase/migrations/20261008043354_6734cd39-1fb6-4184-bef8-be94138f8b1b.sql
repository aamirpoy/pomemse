CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  target_user_id uuid,
  table_name text NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_admin_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  uid uuid := auth.uid();
  o jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  n jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
  target uuid;
begin
  -- only log changes made by admins or by server-side admin tools (no session)
  if uid is not null and not public.has_role(uid, 'admin') then return null; end if;
  target := coalesce(n->>'user_id', o->>'user_id', case when TG_TABLE_NAME='profiles' then coalesce(n->>'id', o->>'id') end)::uuid;
  insert into public.audit_log(actor_id, target_user_id, table_name, action, old_data, new_data)
  values (uid, target, TG_TABLE_NAME, lower(TG_OP), o, n);
  return null;
end $$;
REVOKE EXECUTE ON FUNCTION public.log_admin_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_attendance AFTER INSERT OR UPDATE OR DELETE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
CREATE TRIGGER audit_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
CREATE TRIGGER audit_office AFTER INSERT OR UPDATE OR DELETE ON public.office_settings FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();