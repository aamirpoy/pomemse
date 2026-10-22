ALTER TABLE public.attendance ADD COLUMN admin_note text, ADD COLUMN admin_note_by text, ADD COLUMN admin_note_at timestamptz;
CREATE OR REPLACE FUNCTION public.stamp_admin_note() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if new.admin_note is distinct from (case when tg_op = 'UPDATE' then old.admin_note else null end) then
    new.admin_note := nullif(left(trim(coalesce(new.admin_note,'')), 500), '');
    new.admin_note_at := now();
    new.admin_note_by := coalesce((select nullif(full_name,'') from public.profiles where id = auth.uid()), 'Admin');
  elsif tg_op = 'UPDATE' then
    new.admin_note_at := old.admin_note_at; new.admin_note_by := old.admin_note_by;
  end if;
  return new;
end $$;
CREATE TRIGGER attendance_stamp_admin_note BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.stamp_admin_note();