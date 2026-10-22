ALTER TABLE public.feature_access DROP CONSTRAINT feature_access_feature_key_check;
ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK (feature_key IN ('device_security','meeting_location','admin_notes','device_approval','biometric_check','arabic_language','change_undo'));
ALTER TABLE public.feature_rollouts DROP CONSTRAINT feature_rollouts_feature_key_check;
ALTER TABLE public.feature_rollouts ADD CONSTRAINT feature_rollouts_feature_key_check CHECK (feature_key IN ('device_security','meeting_location','admin_notes','device_approval','biometric_check','arabic_language','change_undo'));

CREATE OR REPLACE FUNCTION public.my_feature_versions() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(array_agg(k),ARRAY[]::text[]) FROM unnest(ARRAY['device_security','meeting_location','admin_notes','device_approval','biometric_check','arabic_language','change_undo']) k WHERE auth.uid() IS NOT NULL AND public.has_feature_access(auth.uid(),k)
$$;

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS reverted_at timestamptz;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS reverted_by uuid;

CREATE OR REPLACE FUNCTION public.admin_revert_change(_log uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
 uid uuid := auth.uid(); l public.audit_log; cols text; rid text; n int;
begin
 if uid is null or not public.has_role(uid,'admin') then raise exception 'Admins only'; end if;
 if not public.has_feature_access(uid,'change_undo') then raise exception 'Undo is not enabled for your account'; end if;
 select * into l from public.audit_log where id=_log for update;
 if l.id is null then raise exception 'Change not found'; end if;
 if l.reverted_at is not null then raise exception 'This change was already undone'; end if;
 if l.table_name not in ('attendance','work_outings','office_settings','profiles','trusted_devices') then
  raise exception 'This type of change cannot be undone here'; end if;
 if l.table_name in ('office_settings','profiles') and l.action <> 'update' then
  raise exception 'Only edits of this type can be undone'; end if;
 rid := coalesce(l.new_data->>'id', l.old_data->>'id');
 if l.action = 'insert' then
  execute format('delete from public.%I where id::text = $1', l.table_name) using rid;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'This record no longer exists'; end if;
 elsif l.action = 'update' then
  select string_agg(quote_ident(column_name), ',') into cols from information_schema.columns
   where table_schema='public' and table_name=l.table_name and column_name <> 'id';
  execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id::text = $2',
   l.table_name, cols, cols, l.table_name) using l.old_data, rid;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'This record no longer exists'; end if;
 elsif l.action = 'delete' then
  if l.table_name = 'work_outings' and not exists (select 1 from public.attendance where id::text = l.old_data->>'attendance_id') then
   raise exception 'Restore the time record for this day first'; end if;
  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict (id) do nothing', l.table_name, l.table_name) using l.old_data;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'This record already exists'; end if;
 end if;
 update public.audit_log set reverted_at = now(), reverted_by = uid where id = l.id;
 return json_build_object('ok', true);
end $$;
REVOKE ALL ON FUNCTION public.admin_revert_change(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_revert_change(uuid) TO authenticated;