CREATE TABLE public.feature_access (
 feature_key text NOT NULL CHECK (feature_key IN ('device_security','meeting_location','admin_notes')),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY (feature_key,user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_access TO authenticated;
GRANT ALL ON public.feature_access TO service_role;
ALTER TABLE public.feature_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own version access or admin" ON public.feature_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage version access" ON public.feature_access FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TABLE public.feature_rollouts (
 feature_key text PRIMARY KEY CHECK (feature_key IN ('device_security','meeting_location','admin_notes')),
 enabled_all boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_rollouts TO authenticated;
GRANT ALL ON public.feature_rollouts TO service_role;
ALTER TABLE public.feature_rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read rollout defaults" ON public.feature_rollouts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage rollouts" ON public.feature_rollouts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.feature_access(feature_key,user_id,enabled)
SELECT v.key,b.user_id,true FROM public.beta_testers b JOIN public.profiles p ON p.id=b.user_id CROSS JOIN (VALUES ('device_security'),('meeting_location'),('admin_notes')) AS v(key);
COMMENT ON TABLE public.beta_testers IS 'DEPRECATED: replaced by independent feature_access and feature_rollouts';
CREATE OR REPLACE FUNCTION public.has_feature_access(_uid uuid,_feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce((SELECT enabled FROM public.feature_access WHERE user_id=_uid AND feature_key=_feature),(SELECT enabled_all FROM public.feature_rollouts WHERE feature_key=_feature),false)
$$;
REVOKE ALL ON FUNCTION public.has_feature_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_feature_access(uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.my_feature_versions() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(array_agg(k),ARRAY[]::text[]) FROM unnest(ARRAY['device_security','meeting_location','admin_notes']) k WHERE auth.uid() IS NOT NULL AND public.has_feature_access(auth.uid(),k)
$$;
REVOKE ALL ON FUNCTION public.my_feature_versions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_feature_versions() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.is_beta(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT public.has_feature_access(_uid,'device_security') OR public.has_feature_access(_uid,'meeting_location') OR public.has_feature_access(_uid,'admin_notes')
$$;
CREATE TRIGGER audit_feature_access AFTER INSERT OR UPDATE OR DELETE ON public.feature_access FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
CREATE TRIGGER audit_feature_rollouts AFTER INSERT OR UPDATE OR DELETE ON public.feature_rollouts FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
CREATE OR REPLACE FUNCTION public.clock_action(_lat double precision, _lng double precision, _note text DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
 o public.office_settings; d double precision; open_row public.attendance;
 uid uuid := auth.uid(); n text := nullif(left(trim(coalesce(_note,'')),500),''); act text; security_on boolean;
begin
 if uid is null then raise exception 'Not signed in'; end if;
 security_on := public.has_feature_access(uid,'device_security');
 if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then raise exception 'A valid location is required to check in or out.'; end if;
 select * into o from public.office_settings where id=1;
 d := public.distance_m(_lat,_lng,o.latitude,o.longitude);
 select * into open_row from public.attendance where user_id=uid and check_out_at is null order by check_in_at desc limit 1;
 act := case when open_row.id is null then 'check_in' else 'check_out' end;
 if d is null or d > o.radius_m then
  if not security_on then raise exception 'You are % m away from the office. You must be within % m.',round(coalesce(d,0)),o.radius_m; end if;
  perform public.log_punch(act,false,_device,_ua,_lat,_lng,_acc,d);
  return json_build_object('error','You must be at the office to check in or out.');
 end if;
 if security_on then perform public.log_punch(act,true,_device,_ua,_lat,_lng,_acc,d); end if;
 if open_row.id is null then
  insert into public.attendance(user_id,check_in_lat,check_in_lng,check_in_distance_m,check_in_note) values(uid,_lat,_lng,round(d),n);
 else
  update public.attendance set check_out_at=now(),check_out_lat=_lat,check_out_lng=_lng,check_out_distance_m=round(d),check_out_note=n where id=open_row.id;
 end if;
 return json_build_object('action',act);
end $$;
CREATE OR REPLACE FUNCTION public.outing_action(_reason text DEFAULT NULL, _lat double precision DEFAULT NULL, _lng double precision DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
 uid uuid := auth.uid(); att public.attendance; ow public.work_outings; off public.office_settings; d double precision; act text;
 r text := nullif(left(trim(coalesce(_reason,'')),500),''); location_on boolean; security_on boolean; valid_location boolean;
begin
 if uid is null then raise exception 'Not signed in'; end if;
 location_on := public.has_feature_access(uid,'meeting_location');
 security_on := public.has_feature_access(uid,'device_security');
 select * into att from public.attendance where user_id=uid and check_out_at is null order by check_in_at desc limit 1;
 if att.id is null then raise exception 'Please check in first'; end if;
 select * into ow from public.work_outings where attendance_id=att.id and back_at is null limit 1;
 act := case when ow.id is null then 'out' else 'back' end;
 if act='out' and r is null then raise exception 'Please write where you are going'; end if;
 valid_location := coalesce(_lat between -90 and 90 and _lng between -180 and 180,false);
 if location_on and not valid_location then raise exception 'A valid location is required.'; end if;
 if valid_location and (location_on or security_on) then
  select * into off from public.office_settings where id=1;
  d := public.distance_m(_lat,_lng,off.latitude,off.longitude);
 end if;
 if location_on and (d is null or d > off.radius_m) then
  if security_on then perform public.log_punch('meeting_'||act,false,_device,_ua,_lat,_lng,_acc,d); end if;
  return json_build_object('error','You must be at the office to do this.');
 end if;
 if security_on then perform public.log_punch('meeting_'||act,true,_device,_ua,_lat,_lng,_acc,d); end if;
 if act='out' then
  insert into public.work_outings(user_id,attendance_id,reason,out_lat,out_lng,out_distance_m) values(uid,att.id,r,case when valid_location then _lat end,case when valid_location then _lng end,round(d));
 else
  update public.work_outings set back_at=now(),back_lat=case when valid_location then _lat end,back_lng=case when valid_location then _lng end,back_distance_m=round(d) where id=ow.id;
 end if;
 return json_build_object('action',act);
end $$;