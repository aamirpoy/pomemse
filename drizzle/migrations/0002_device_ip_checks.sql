CREATE TABLE public.punch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  device_id text,
  user_agent text,
  ip text,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  distance_m integer,
  flags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new',
  admin_note text
);
CREATE INDEX punch_events_created_idx ON public.punch_events(created_at DESC);
CREATE INDEX punch_events_device_idx ON public.punch_events(device_id, created_at);
CREATE INDEX punch_events_ip_idx ON public.punch_events(ip, created_at);
GRANT SELECT, UPDATE ON public.punch_events TO authenticated;
GRANT ALL ON public.punch_events TO service_role;
ALTER TABLE public.punch_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads punch events" ON public.punch_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin reviews punch events" ON public.punch_events FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.work_outings ADD COLUMN out_lat double precision, ADD COLUMN out_lng double precision, ADD COLUMN out_distance_m integer,
  ADD COLUMN back_lat double precision, ADD COLUMN back_lng double precision, ADD COLUMN back_distance_m integer;

CREATE OR REPLACE FUNCTION public.log_punch(_action text, _ok boolean, _device text, _ua text, _lat double precision, _lng double precision, _acc double precision, _dist double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  uid uuid := auth.uid();
  h json;
  ip text;
  f text[] := '{}';
  dev text := nullif(left(trim(coalesce(_device,'')),100),'');
  last public.punch_events;
  o public.office_settings;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  ip := trim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-forwarded-for', h->>'x-real-ip', ''), ',', 1));
  ip := nullif(ip,'');
  select * into o from public.office_settings where id = 1;
  if dev is null then f := f || 'no_device_id'; end if;
  if dev is not null and exists (select 1 from public.punch_events where user_id = uid and device_id is not null)
     and not exists (select 1 from public.punch_events where user_id = uid and device_id = dev) then f := f || 'new_device'; end if;
  if dev is not null and exists (select 1 from public.punch_events where device_id = dev and user_id <> uid and created_at > now() - interval '12 hours') then f := f || 'shared_device'; end if;
  if ip is not null and exists (select 1 from public.punch_events where ip = log_punch.ip and user_id <> uid and created_at > now() - interval '10 minutes') then f := f || 'shared_ip'; end if;
  if not _ok then f := f || 'outside_office'; end if;
  if _dist is not null and _dist > greatest(o.radius_m * 10, 2000) then f := f || 'far_away'; end if;
  if _acc is not null and _acc > 150 then f := f || 'low_accuracy'; end if;
  if _acc is not null and _acc = 0 then f := f || 'fake_gps_sign'; end if;
  if (select count(*) from public.punch_events where user_id = uid and not success and created_at > now() - interval '30 minutes') >= 2 then f := f || 'repeated_failures'; end if;
  select * into last from public.punch_events where user_id = uid and lat is not null order by created_at desc limit 1;
  if last.id is not null and _lat is not null and extract(epoch from now() - last.created_at) between 1 and 3600
     and public.distance_m(_lat,_lng,last.lat,last.lng) / extract(epoch from now() - last.created_at) > 70 then f := f || 'impossible_travel'; end if;
  insert into public.punch_events(user_id, action, success, device_id, user_agent, ip, lat, lng, accuracy_m, distance_m, flags, status)
  values (uid, _action, _ok, dev, left(_ua,300), ip, _lat, _lng, _acc, round(_dist), f, case when cardinality(f) = 0 then 'reviewed' else 'new' end);
end $$;
REVOKE EXECUTE ON FUNCTION public.log_punch(text,boolean,text,text,double precision,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.clock_action(double precision, double precision, text);
CREATE FUNCTION public.clock_action(_lat double precision, _lng double precision, _note text DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  o public.office_settings; d double precision; open_row public.attendance;
  uid uuid := auth.uid(); n text := nullif(left(trim(coalesce(_note,'')), 500), ''); act text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'A valid location is required to check in or out.';
  end if;
  select * into o from public.office_settings where id = 1;
  d := public.distance_m(_lat, _lng, o.latitude, o.longitude);
  select * into open_row from public.attendance where user_id = uid and check_out_at is null order by check_in_at desc limit 1;
  act := case when open_row.id is null then 'check_in' else 'check_out' end;
  if d is null or d > o.radius_m then
    perform public.log_punch(act, false, _device, _ua, _lat, _lng, _acc, d);
    return json_build_object('error', 'You must be at the office to check in or out.');
  end if;
  perform public.log_punch(act, true, _device, _ua, _lat, _lng, _acc, d);
  if open_row.id is null then
    insert into public.attendance (user_id, check_in_lat, check_in_lng, check_in_distance_m, check_in_note)
    values (uid, _lat, _lng, round(d), n);
  else
    update public.attendance set check_out_at = now(), check_out_lat = _lat, check_out_lng = _lng,
      check_out_distance_m = round(d), check_out_note = n where id = open_row.id;
  end if;
  return json_build_object('action', act);
end $$;

DROP FUNCTION public.outing_action(text);
CREATE FUNCTION public.outing_action(_reason text DEFAULT NULL, _lat double precision DEFAULT NULL, _lng double precision DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  uid uuid := auth.uid(); att public.attendance; ow public.work_outings; off public.office_settings; d double precision; act text;
  r text := nullif(left(trim(coalesce(_reason,'')), 500), '');
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'A valid location is required.';
  end if;
  select * into att from public.attendance where user_id = uid and check_out_at is null order by check_in_at desc limit 1;
  if att.id is null then raise exception 'Please check in first'; end if;
  select * into ow from public.work_outings where attendance_id = att.id and back_at is null limit 1;
  act := case when ow.id is null then 'out' else 'back' end;
  if act = 'out' and r is null then raise exception 'Please write where you are going'; end if;
  select * into off from public.office_settings where id = 1;
  d := public.distance_m(_lat, _lng, off.latitude, off.longitude);
  if d is null or d > off.radius_m then
    perform public.log_punch('meeting_' || act, false, _device, _ua, _lat, _lng, _acc, d);
    return json_build_object('error', 'You must be at the office to do this.');
  end if;
  perform public.log_punch('meeting_' || act, true, _device, _ua, _lat, _lng, _acc, d);
  if act = 'out' then
    insert into public.work_outings(user_id, attendance_id, reason, out_lat, out_lng, out_distance_m) values (uid, att.id, r, _lat, _lng, round(d));
  else
    update public.work_outings set back_at = now(), back_lat = _lat, back_lng = _lng, back_distance_m = round(d) where id = ow.id;
  end if;
  return json_build_object('action', act);
end $$;
GRANT EXECUTE ON FUNCTION public.clock_action(double precision,double precision,text,text,text,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.outing_action(text,double precision,double precision,text,text,double precision) TO authenticated;