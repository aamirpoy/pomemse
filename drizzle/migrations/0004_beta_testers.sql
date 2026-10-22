CREATE TABLE public.beta_testers (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.beta_testers TO authenticated;
GRANT ALL ON public.beta_testers TO service_role;
ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or admin testers" ON public.beta_testers FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin adds testers" ON public.beta_testers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin removes testers" ON public.beta_testers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.is_beta(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.beta_testers where user_id = _uid)
$$;

CREATE OR REPLACE FUNCTION public.clock_action(_lat double precision, _lng double precision, _note text DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  o public.office_settings; d double precision; open_row public.attendance;
  uid uuid := auth.uid(); n text := nullif(left(trim(coalesce(_note,'')), 500), ''); act text;
  beta boolean;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  beta := public.is_beta(uid);
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'A valid location is required to check in or out.';
  end if;
  select * into o from public.office_settings where id = 1;
  d := public.distance_m(_lat, _lng, o.latitude, o.longitude);
  select * into open_row from public.attendance where user_id = uid and check_out_at is null order by check_in_at desc limit 1;
  act := case when open_row.id is null then 'check_in' else 'check_out' end;
  if d is null or d > o.radius_m then
    if not beta then
      raise exception 'You are % m away from the office. You must be within % m.', round(coalesce(d, 0)), o.radius_m;
    end if;
    perform public.log_punch(act, false, _device, _ua, _lat, _lng, _acc, d);
    return json_build_object('error', 'You must be at the office to check in or out.');
  end if;
  if beta then perform public.log_punch(act, true, _device, _ua, _lat, _lng, _acc, d); end if;
  if open_row.id is null then
    insert into public.attendance (user_id, check_in_lat, check_in_lng, check_in_distance_m, check_in_note)
    values (uid, _lat, _lng, round(d), n);
  else
    update public.attendance set check_out_at = now(), check_out_lat = _lat, check_out_lng = _lng,
      check_out_distance_m = round(d), check_out_note = n where id = open_row.id;
  end if;
  return json_build_object('action', act);
end $$;

CREATE OR REPLACE FUNCTION public.outing_action(_reason text DEFAULT NULL, _lat double precision DEFAULT NULL, _lng double precision DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  uid uuid := auth.uid(); att public.attendance; ow public.work_outings; off public.office_settings; d double precision; act text;
  r text := nullif(left(trim(coalesce(_reason,'')), 500), ''); beta boolean;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  beta := public.is_beta(uid);
  select * into att from public.attendance where user_id = uid and check_out_at is null order by check_in_at desc limit 1;
  if att.id is null then raise exception 'Please check in first'; end if;
  select * into ow from public.work_outings where attendance_id = att.id and back_at is null limit 1;
  act := case when ow.id is null then 'out' else 'back' end;
  if act = 'out' and r is null then raise exception 'Please write where you are going'; end if;
  if beta then
    if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
      raise exception 'A valid location is required.';
    end if;
    select * into off from public.office_settings where id = 1;
    d := public.distance_m(_lat, _lng, off.latitude, off.longitude);
    if d is null or d > off.radius_m then
      perform public.log_punch('meeting_' || act, false, _device, _ua, _lat, _lng, _acc, d);
      return json_build_object('error', 'You must be at the office to do this.');
    end if;
    perform public.log_punch('meeting_' || act, true, _device, _ua, _lat, _lng, _acc, d);
  end if;
  if act = 'out' then
    insert into public.work_outings(user_id, attendance_id, reason, out_lat, out_lng, out_distance_m) values (uid, att.id, r, _lat, _lng, round(d));
  else
    update public.work_outings set back_at = now(), back_lat = _lat, back_lng = _lng, back_distance_m = round(d) where id = ow.id;
  end if;
  return json_build_object('action', act);
end $$;