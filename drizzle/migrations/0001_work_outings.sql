CREATE TABLE public.work_outings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  out_at timestamptz NOT NULL DEFAULT now(),
  back_at timestamptz,
  reason text
);
GRANT SELECT ON public.work_outings TO authenticated;
GRANT ALL ON public.work_outings TO service_role;
ALTER TABLE public.work_outings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own outings or admin" ON public.work_outings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX work_outings_att_idx ON public.work_outings(attendance_id);

CREATE OR REPLACE FUNCTION public.outing_action(_reason text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  uid uuid := auth.uid();
  att public.attendance;
  o public.work_outings;
  r text := nullif(left(trim(coalesce(_reason,'')), 500), '');
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into att from public.attendance where user_id = uid and check_out_at is null order by check_in_at desc limit 1;
  if att.id is null then raise exception 'Please check in first'; end if;
  select * into o from public.work_outings where attendance_id = att.id and back_at is null limit 1;
  if o.id is null then
    if r is null then raise exception 'Please write where you are going'; end if;
    insert into public.work_outings(user_id, attendance_id, reason) values (uid, att.id, r);
    return json_build_object('action','out');
  else
    update public.work_outings set back_at = now() where id = o.id;
    return json_build_object('action','back');
  end if;
end $$;

-- closing a day also closes any open outing
CREATE OR REPLACE FUNCTION public.close_outings_on_checkout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if new.check_out_at is not null and old.check_out_at is null then
    update public.work_outings set back_at = new.check_out_at where attendance_id = new.id and back_at is null;
  end if;
  return new;
end $$;
CREATE TRIGGER close_outings AFTER UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.close_outings_on_checkout();