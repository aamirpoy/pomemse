CREATE UNIQUE INDEX trusted_devices_one_account_per_device ON public.trusted_devices(device_id);
CREATE OR REPLACE FUNCTION public.protect_device_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.device_id IS DISTINCT FROM OLD.device_id THEN RAISE EXCEPTION 'Remove the device registration before assigning it to another account'; END IF; RETURN NEW; END $$;
CREATE TRIGGER protect_device_binding BEFORE UPDATE ON public.trusted_devices FOR EACH ROW EXECUTE FUNCTION public.protect_device_binding();
CREATE OR REPLACE FUNCTION public.register_my_device(_device text,_ua text DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); td public.trusted_devices;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 IF NOT public.has_feature_access(uid,'device_approval') THEN RAISE EXCEPTION 'Registered devices is not enabled for your account'; END IF;
 IF _device IS NULL OR length(_device)<8 OR length(_device)>128 OR _device<>trim(_device) THEN RAISE EXCEPTION 'This device could not be identified'; END IF;
 INSERT INTO public.trusted_devices(user_id,device_id,user_agent) VALUES(uid,_device,left(_ua,500)) ON CONFLICT(device_id) DO NOTHING;
 SELECT * INTO td FROM public.trusted_devices WHERE device_id=_device;
 IF td.user_id<>uid THEN RETURN json_build_object('error','This device is registered to another account. Only an admin can remove its registration.'); END IF;
 RETURN json_build_object('status',td.status);
END $$;
REVOKE ALL ON FUNCTION public.register_my_device(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_my_device(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.punch_device_error(_device text,_ua text,_required boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); td public.trusted_devices;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 IF _device IS NULL OR length(_device)<8 OR length(_device)>128 OR _device<>trim(_device) THEN
  IF _required THEN RETURN 'This device could not be identified. Please use the app in a normal browser.'; END IF; RETURN NULL;
 END IF;
 IF _required THEN INSERT INTO public.trusted_devices(user_id,device_id,user_agent) VALUES(uid,_device,left(_ua,500)) ON CONFLICT(device_id) DO NOTHING; END IF;
 SELECT * INTO td FROM public.trusted_devices WHERE device_id=_device FOR UPDATE;
 IF td.id IS NOT NULL AND td.user_id<>uid THEN RETURN 'This device is registered to another account. Only an admin can remove its registration.'; END IF;
 IF _required AND td.status='rejected' THEN RETURN 'This device is blocked. Please contact your admin.'; END IF;
 IF _required AND td.status IS DISTINCT FROM 'approved' THEN RETURN 'This device is waiting for admin approval.'; END IF;
 IF td.id IS NOT NULL THEN UPDATE public.trusted_devices SET last_seen_at=now(),user_agent=coalesce(left(_ua,500),user_agent) WHERE id=td.id; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.punch_device_error(text,text,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.log_punch(_action text,_ok boolean,_device text,_ua text,_lat double precision,_lng double precision,_acc double precision,_dist double precision) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); h json; v_ip text; f text[]:='{}'; dev text:=nullif(left(trim(coalesce(_device,'')),100),''); prev public.punch_events; o public.office_settings;
BEGIN
 BEGIN h:=current_setting('request.headers',true)::json; EXCEPTION WHEN OTHERS THEN h:=NULL; END;
 v_ip:=nullif(trim(split_part(coalesce(h->>'cf-connecting-ip',h->>'x-forwarded-for',h->>'x-real-ip',''),',',1)),'');
 SELECT * INTO o FROM public.office_settings WHERE id=1;
 IF dev IS NULL THEN f:=f||'no_device_id'; END IF;
 IF dev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trusted_devices t WHERE t.user_id=uid AND t.device_id=dev) AND EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.user_id=uid AND pe.device_id IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.user_id=uid AND pe.device_id=dev) THEN f:=f||'new_device'; END IF;
 IF dev IS NOT NULL AND (EXISTS(SELECT 1 FROM public.trusted_devices t WHERE t.device_id=dev AND t.user_id<>uid) OR EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.device_id=dev AND pe.user_id<>uid AND pe.created_at>now()-interval '12 hours')) THEN f:=f||'shared_device'; END IF;
 IF v_ip IS NOT NULL AND EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.ip=v_ip AND pe.user_id<>uid AND pe.created_at>now()-interval '10 minutes') THEN f:=f||'shared_ip'; END IF;
 IF _dist IS NOT NULL AND _dist>o.radius_m THEN f:=f||'outside_office'; END IF;
 IF _action='device_pending' THEN f:=f||'device_pending'; END IF;
 IF _action='device_blocked' THEN f:=f||'device_blocked'; END IF;
 IF _dist IS NOT NULL AND _dist>greatest(o.radius_m*10,2000) THEN f:=f||'far_away'; END IF;
 IF _acc IS NOT NULL AND _acc>150 THEN f:=f||'low_accuracy'; END IF;
 IF _acc=0 THEN f:=f||'fake_gps_sign'; END IF;
 IF (SELECT count(*) FROM public.punch_events pe WHERE pe.user_id=uid AND NOT pe.success AND pe.created_at>now()-interval '30 minutes')>=2 THEN f:=f||'repeated_failures'; END IF;
 SELECT * INTO prev FROM public.punch_events pe WHERE pe.user_id=uid AND pe.lat IS NOT NULL ORDER BY pe.created_at DESC LIMIT 1;
 IF prev.id IS NOT NULL AND _lat IS NOT NULL AND extract(epoch FROM now()-prev.created_at) BETWEEN 1 AND 3600 AND public.distance_m(_lat,_lng,prev.lat,prev.lng)/extract(epoch FROM now()-prev.created_at)>70 THEN f:=f||'impossible_travel'; END IF;
 INSERT INTO public.punch_events(user_id,action,success,device_id,user_agent,ip,lat,lng,accuracy_m,distance_m,flags,status) VALUES(uid,_action,_ok,dev,left(_ua,300),v_ip,_lat,_lng,_acc,round(_dist),f,CASE WHEN cardinality(f)=0 THEN 'reviewed' ELSE 'new' END);
END $$;
CREATE OR REPLACE FUNCTION public.clock_action(_lat double precision,_lng double precision,_note text DEFAULT NULL,_device text DEFAULT NULL,_ua text DEFAULT NULL,_acc double precision DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.office_settings; d double precision; open_row public.attendance; uid uuid:=auth.uid(); n text:=nullif(left(trim(coalesce(_note,'')),500),''); act text; security_on boolean; device_on boolean; bio_on boolean; device_error text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 security_on:=public.has_feature_access(uid,'device_security'); device_on:=public.has_feature_access(uid,'device_approval'); bio_on:=public.has_feature_access(uid,'biometric_check');
 IF _lat IS NULL OR _lng IS NULL OR _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'A valid location is required to check in or out.'; END IF;
 SELECT * INTO o FROM public.office_settings WHERE id=1;
 d:=public.distance_m(_lat,_lng,o.latitude,o.longitude);
 SELECT * INTO open_row FROM public.attendance WHERE user_id=uid AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1;
 act:=CASE WHEN open_row.id IS NULL THEN 'check_in' ELSE 'check_out' END;
 device_error:=public.punch_device_error(_device,_ua,device_on);
 IF device_error IS NOT NULL THEN
  PERFORM public.log_punch(CASE WHEN device_error LIKE '%waiting%' THEN 'device_pending' ELSE 'device_blocked' END,false,_device,_ua,_lat,_lng,_acc,d);
  RETURN json_build_object('error',device_error);
 END IF;
 IF d IS NULL OR d>o.radius_m THEN
  PERFORM public.log_punch(act,false,_device,_ua,_lat,_lng,_acc,d);
  RETURN json_build_object('error',format('You are %s m away from the office. Check-in/out is only allowed inside the office area.',round(coalesce(d,0))),'distance_m',round(d),'code','outside_office');
 END IF;
 IF bio_on AND NOT EXISTS(SELECT 1 FROM public.biometric_passes WHERE user_id=uid AND created_at>now()-interval '2 minutes') THEN RETURN json_build_object('error','Face or fingerprint verification is required before checking in or out.'); END IF;
 IF bio_on THEN DELETE FROM public.biometric_passes WHERE user_id=uid; END IF;
 IF security_on OR device_on THEN PERFORM public.log_punch(act,true,_device,_ua,_lat,_lng,_acc,d); END IF;
 IF open_row.id IS NULL THEN INSERT INTO public.attendance(user_id,check_in_lat,check_in_lng,check_in_distance_m,check_in_note) VALUES(uid,_lat,_lng,round(d),n);
 ELSE UPDATE public.attendance SET check_out_at=now(),check_out_lat=_lat,check_out_lng=_lng,check_out_distance_m=round(d),check_out_note=n WHERE id=open_row.id; END IF;
 RETURN json_build_object('action',act);
END $$;
CREATE OR REPLACE FUNCTION public.outing_action(_reason text DEFAULT NULL,_lat double precision DEFAULT NULL,_lng double precision DEFAULT NULL,_device text DEFAULT NULL,_ua text DEFAULT NULL,_acc double precision DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); att public.attendance; ow public.work_outings; off public.office_settings; d double precision; act text; r text:=nullif(left(trim(coalesce(_reason,'')),500),''); location_on boolean; security_on boolean; valid_location boolean; device_on boolean; device_error text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 location_on:=public.has_feature_access(uid,'meeting_location'); security_on:=public.has_feature_access(uid,'device_security'); device_on:=public.has_feature_access(uid,'device_approval');
 SELECT * INTO att FROM public.attendance WHERE user_id=uid AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1;
 IF att.id IS NULL THEN RAISE EXCEPTION 'Please check in first'; END IF;
 SELECT * INTO ow FROM public.work_outings WHERE attendance_id=att.id AND back_at IS NULL LIMIT 1;
 act:=CASE WHEN ow.id IS NULL THEN 'out' ELSE 'back' END;
 IF act='out' AND r IS NULL THEN RAISE EXCEPTION 'Please write where you are going'; END IF;
 valid_location:=coalesce(_lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180,false);
 IF location_on AND NOT valid_location THEN RAISE EXCEPTION 'A valid location is required.'; END IF;
 IF valid_location THEN SELECT * INTO off FROM public.office_settings WHERE id=1; d:=public.distance_m(_lat,_lng,off.latitude,off.longitude); END IF;
 device_error:=public.punch_device_error(_device,_ua,device_on);
 IF device_error IS NOT NULL THEN PERFORM public.log_punch(CASE WHEN device_error LIKE '%waiting%' THEN 'device_pending' ELSE 'device_blocked' END,false,_device,_ua,_lat,_lng,_acc,d); RETURN json_build_object('error',device_error); END IF;
 IF location_on AND (d IS NULL OR d>off.radius_m) THEN
  PERFORM public.log_punch('meeting_'||act,false,_device,_ua,_lat,_lng,_acc,d);
  RETURN json_build_object('error',format('You are %s m away from the office. This action is only allowed inside the office area.',round(coalesce(d,0))),'distance_m',round(d),'code','outside_office');
 END IF;
 IF security_on OR device_on THEN PERFORM public.log_punch('meeting_'||act,true,_device,_ua,_lat,_lng,_acc,d); END IF;
 IF act='out' THEN INSERT INTO public.work_outings(user_id,attendance_id,reason,out_lat,out_lng,out_distance_m) VALUES(uid,att.id,r,CASE WHEN valid_location THEN _lat END,CASE WHEN valid_location THEN _lng END,round(d));
 ELSE UPDATE public.work_outings SET back_at=now(),back_lat=CASE WHEN valid_location THEN _lat END,back_lng=CASE WHEN valid_location THEN _lng END,back_distance_m=round(d) WHERE id=ow.id; END IF;
 RETURN json_build_object('action',act);
END $$;