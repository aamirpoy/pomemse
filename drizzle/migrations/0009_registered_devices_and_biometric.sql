ALTER TABLE public.feature_access DROP CONSTRAINT feature_access_feature_key_check;
ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK (feature_key IN ('device_security','meeting_location','admin_notes','device_approval','biometric_check'));
ALTER TABLE public.feature_rollouts DROP CONSTRAINT feature_rollouts_feature_key_check;
ALTER TABLE public.feature_rollouts ADD CONSTRAINT feature_rollouts_feature_key_check CHECK (feature_key IN ('device_security','meeting_location','admin_notes','device_approval','biometric_check'));

CREATE TABLE public.trusted_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 device_id text NOT NULL,
 user_agent text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz,
 approved_by uuid,
 last_seen_at timestamptz,
 UNIQUE(user_id, device_id)
);
GRANT SELECT, UPDATE, DELETE ON public.trusted_devices TO authenticated;
GRANT ALL ON public.trusted_devices TO service_role;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own devices or admin" ON public.trusted_devices FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage devices" ON public.trusted_devices FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins delete devices" ON public.trusted_devices FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER audit_trusted_devices AFTER INSERT OR UPDATE OR DELETE ON public.trusted_devices FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();

CREATE TABLE public.webauthn_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 credential_id text NOT NULL UNIQUE,
 public_key text NOT NULL,
 counter bigint NOT NULL DEFAULT 0,
 transports text[],
 label text,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webauthn_credentials TO authenticated;
GRANT ALL ON public.webauthn_credentials TO service_role;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own credentials or admin" ON public.webauthn_credentials FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.webauthn_challenges (
 user_id uuid PRIMARY KEY,
 challenge text NOT NULL,
 expires_at timestamptz NOT NULL
);
GRANT ALL ON public.webauthn_challenges TO service_role;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.biometric_passes (
 user_id uuid PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.biometric_passes TO service_role;
ALTER TABLE public.biometric_passes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_feature_versions() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(array_agg(k),ARRAY[]::text[]) FROM unnest(ARRAY['device_security','meeting_location','admin_notes','device_approval','biometric_check']) k WHERE auth.uid() IS NOT NULL AND public.has_feature_access(auth.uid(),k)
$$;

CREATE OR REPLACE FUNCTION public.clock_action(_lat double precision, _lng double precision, _note text DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
 o public.office_settings; d double precision; open_row public.attendance;
 uid uuid := auth.uid(); n text := nullif(left(trim(coalesce(_note,'')),500),''); act text; security_on boolean;
 device_on boolean; bio_on boolean; td public.trusted_devices;
begin
 if uid is null then raise exception 'Not signed in'; end if;
 security_on := public.has_feature_access(uid,'device_security');
 device_on := public.has_feature_access(uid,'device_approval');
 bio_on := public.has_feature_access(uid,'biometric_check');
 if device_on then
  if _device is null or length(_device) < 8 then raise exception 'This device could not be identified. Please use the app in a normal browser.'; end if;
  select * into td from public.trusted_devices where user_id=uid and device_id=_device;
  if td.id is null then
   insert into public.trusted_devices(user_id,device_id,user_agent) values(uid,_device,_ua) on conflict (user_id,device_id) do nothing;
   if security_on then perform public.log_punch('device_pending',false,_device,_ua,_lat,_lng,_acc,null); end if;
   return json_build_object('error','This device is new. Ask your admin to approve it under Admin > Devices, then try again.');
  elsif td.status = 'rejected' then
   if security_on then perform public.log_punch('device_blocked',false,_device,_ua,_lat,_lng,_acc,null); end if;
   return json_build_object('error','This device is blocked. Please contact your admin.');
  elsif td.status <> 'approved' then
   return json_build_object('error','This device is still waiting for admin approval.');
  else
   update public.trusted_devices set last_seen_at=now(), user_agent=coalesce(_ua,user_agent) where id=td.id;
  end if;
 end if;
 if bio_on and not exists (select 1 from public.biometric_passes where user_id=uid and created_at > now() - interval '2 minutes') then
  return json_build_object('error','Face or fingerprint verification is required before checking in or out.');
 end if;
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
 if bio_on then delete from public.biometric_passes where user_id=uid; end if;
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
 device_on boolean; td public.trusted_devices;
begin
 if uid is null then raise exception 'Not signed in'; end if;
 location_on := public.has_feature_access(uid,'meeting_location');
 security_on := public.has_feature_access(uid,'device_security');
 device_on := public.has_feature_access(uid,'device_approval');
 if device_on then
  if _device is null or length(_device) < 8 then raise exception 'This device could not be identified.'; end if;
  select * into td from public.trusted_devices where user_id=uid and device_id=_device;
  if td.id is null then
   insert into public.trusted_devices(user_id,device_id,user_agent) values(uid,_device,_ua) on conflict (user_id,device_id) do nothing;
   return json_build_object('error','This device is new. Ask your admin to approve it under Admin > Devices, then try again.');
  elsif td.status = 'rejected' then
   return json_build_object('error','This device is blocked. Please contact your admin.');
  elsif td.status <> 'approved' then
   return json_build_object('error','This device is still waiting for admin approval.');
  end if;
 end if;
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