ALTER TABLE public.punch_events ADD COLUMN IF NOT EXISTS shared_ip_users uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS punch_events_ip_time_idx ON public.punch_events(ip,created_at DESC);
CREATE INDEX IF NOT EXISTS punch_events_user_time_idx ON public.punch_events(user_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.log_punch(_action text, _ok boolean, _device text, _ua text, _lat double precision, _lng double precision, _acc double precision, _dist double precision, _extra text[] DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); h json; v_ip text; f text[]:='{}'; dev text:=nullif(left(trim(coalesce(_device,'')),100),''); prev public.punch_events; o public.office_settings; peers uuid[]:='{}';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 BEGIN h:=current_setting('request.headers',true)::json; EXCEPTION WHEN OTHERS THEN h:=NULL; END;
 v_ip:=nullif(trim(split_part(coalesce(h->>'cf-connecting-ip',h->>'x-forwarded-for',h->>'x-real-ip',''),',',1)),'');
 SELECT * INTO o FROM public.office_settings WHERE id=1;
 IF dev IS NULL THEN f:=array_append(f,'no_device_id'); END IF;
 IF dev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trusted_devices t WHERE t.user_id=uid AND t.device_id=dev) AND EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.user_id=uid AND pe.device_id IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.user_id=uid AND pe.device_id=dev) THEN f:=array_append(f,'new_device'); END IF;
 IF dev IS NOT NULL AND (EXISTS(SELECT 1 FROM public.trusted_devices t WHERE t.device_id=dev AND t.user_id<>uid) OR EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.device_id=dev AND pe.user_id<>uid AND pe.created_at>now()-interval '12 hours')) THEN f:=array_append(f,'shared_device'); END IF;
 IF v_ip IS NOT NULL THEN SELECT coalesce(array_agg(DISTINCT pe.user_id),'{}'::uuid[]) INTO peers FROM public.punch_events pe WHERE pe.ip=v_ip AND pe.user_id<>uid AND pe.created_at>now()-interval '10 minutes'; IF cardinality(peers)>0 THEN f:=array_append(f,'shared_ip'); END IF; END IF;
 IF _dist IS NOT NULL AND _dist>o.radius_m THEN f:=array_append(f,'outside_office'); END IF;
 IF _action='device_pending' THEN f:=array_append(f,'device_pending'); END IF;
 IF _action='device_blocked' THEN f:=array_append(f,'device_blocked'); END IF;
 IF _dist IS NOT NULL AND _dist>greatest(o.radius_m*10,2000) THEN f:=array_append(f,'far_away'); END IF;
 IF _acc IS NOT NULL AND _acc>150 THEN f:=array_append(f,'low_accuracy'); END IF;
 IF _acc=0 THEN f:=array_append(f,'fake_gps_sign'); END IF;
 IF _extra IS NOT NULL THEN f:=f||_extra; END IF;
 IF (SELECT count(*) FROM public.punch_events pe WHERE pe.user_id=uid AND NOT pe.success AND pe.created_at>now()-interval '30 minutes')>=2 THEN f:=array_append(f,'repeated_failures'); END IF;
 SELECT * INTO prev FROM public.punch_events pe WHERE pe.user_id=uid AND pe.lat IS NOT NULL ORDER BY pe.created_at DESC LIMIT 1;
 IF prev.id IS NOT NULL AND _lat IS NOT NULL AND extract(epoch FROM now()-prev.created_at) BETWEEN 1 AND 3600 AND public.distance_m(_lat,_lng,prev.lat,prev.lng)/extract(epoch FROM now()-prev.created_at)>70 THEN f:=array_append(f,'impossible_travel'); END IF;
 SELECT coalesce(array_agg(DISTINCT flag),'{}'::text[]) INTO f FROM unnest(f) flag;
 INSERT INTO public.punch_events(user_id,action,success,device_id,user_agent,ip,lat,lng,accuracy_m,distance_m,flags,status,shared_ip_users) VALUES(uid,_action,_ok,dev,left(_ua,300),v_ip,_lat,_lng,_acc,round(_dist),f,CASE WHEN cardinality(f)=0 THEN 'reviewed' ELSE 'new' END,peers);
END $$;
CREATE OR REPLACE FUNCTION public.clock_action(_lat double precision, _lng double precision, _note text DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL, _captured_at bigint DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.office_settings; d double precision; a public.attendance; uid uuid:=auth.uid(); act text; device_error text; bio_on boolean;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT * INTO a FROM public.attendance WHERE user_id=uid AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1;
 act:=CASE WHEN a.id IS NULL THEN 'check_in' ELSE 'check_out' END;
 IF NOT coalesce(_lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180,false) THEN PERFORM public.log_punch(act,false,_device,_ua,NULL,NULL,_acc,NULL,ARRAY['invalid_location']); RETURN json_build_object('error','A fresh location is required. Refresh the page and allow location access.'); END IF;
 SELECT * INTO o FROM public.office_settings WHERE id=1;
 d:=public.distance_m(_lat,_lng,o.latitude,o.longitude);
 IF _captured_at IS NULL OR abs(extract(epoch FROM now())*1000-_captured_at)>30000 THEN PERFORM public.log_punch(act,false,_device,_ua,_lat,_lng,_acc,d,ARRAY['stale_location']); RETURN json_build_object('error','Location could not be verified. Refresh this page, enable automatic date and time on your phone, then try again.','code','stale_location'); END IF;
 IF _acc IS NULL OR NOT (_acc>0 AND _acc<=150) THEN PERFORM public.log_punch(act,false,_device,_ua,_lat,_lng,_acc,d,ARRAY['low_accuracy']); RETURN json_build_object('error','Your phone GPS is not accurate enough right now. Move to an open area and tap again.','code','low_accuracy'); END IF;
 device_error:=public.punch_device_error(_device,_ua,public.has_feature_access(uid,'device_approval'));
 IF device_error IS NOT NULL THEN PERFORM public.log_punch(CASE WHEN device_error LIKE '%waiting%' THEN 'device_pending' ELSE 'device_blocked' END,false,_device,_ua,_lat,_lng,_acc,d); RETURN json_build_object('error',device_error); END IF;
 IF d IS NULL OR d>o.radius_m THEN PERFORM public.log_punch(act,false,_device,_ua,_lat,_lng,_acc,d); RETURN json_build_object('error',format('You are %s m away from the office. Check-in/out is only allowed inside the office area.',round(coalesce(d,0))),'distance_m',round(d),'code','outside_office'); END IF;
 bio_on:=public.has_feature_access(uid,'biometric_check');
 IF bio_on AND NOT EXISTS(SELECT 1 FROM public.biometric_passes WHERE user_id=uid AND created_at>now()-interval '2 minutes') THEN PERFORM public.log_punch(act,false,_device,_ua,_lat,_lng,_acc,d,ARRAY['biometric_required']); RETURN json_build_object('error','Face or fingerprint verification is required before checking in or out.'); END IF;
 IF bio_on THEN DELETE FROM public.biometric_passes WHERE user_id=uid; END IF;
 IF a.id IS NULL THEN INSERT INTO public.attendance(user_id,check_in_lat,check_in_lng,check_in_distance_m,check_in_note) VALUES(uid,_lat,_lng,round(d),nullif(left(trim(coalesce(_note,'')),500),'')) RETURNING * INTO a;
 ELSE UPDATE public.attendance SET check_out_at=now(),check_out_lat=_lat,check_out_lng=_lng,check_out_distance_m=round(d),check_out_note=nullif(left(trim(coalesce(_note,'')),500),'') WHERE id=a.id RETURNING * INTO a; END IF;
 PERFORM public.log_punch(act,true,_device,_ua,_lat,_lng,_acc,d);
 RETURN json_build_object('action',act,'record_id',a.id,'saved_at',CASE WHEN act='check_in' THEN a.check_in_at ELSE a.check_out_at END);
END $$;
CREATE OR REPLACE FUNCTION public.outing_action(_reason text DEFAULT NULL, _lat double precision DEFAULT NULL, _lng double precision DEFAULT NULL, _device text DEFAULT NULL, _ua text DEFAULT NULL, _acc double precision DEFAULT NULL, _captured_at bigint DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); att public.attendance; ow public.work_outings; off public.office_settings; d double precision; act text; r text:=nullif(left(trim(coalesce(_reason,'')),500),''); device_error text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT * INTO att FROM public.attendance WHERE user_id=uid AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1;
 SELECT * INTO ow FROM public.work_outings WHERE attendance_id=att.id AND back_at IS NULL LIMIT 1;
 act:=CASE WHEN ow.id IS NULL THEN 'out' ELSE 'back' END;
 IF att.id IS NULL THEN PERFORM public.log_punch('meeting_'||act,false,_device,_ua,NULL,NULL,NULL,NULL,ARRAY['not_checked_in']); RETURN json_build_object('error','Please check in first'); END IF;
 IF act='out' AND r IS NULL THEN PERFORM public.log_punch('meeting_out',false,_device,_ua,NULL,NULL,NULL,NULL,ARRAY['missing_reason']); RETURN json_build_object('error','Please write where you are going'); END IF;
 IF NOT coalesce(_lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180,false) THEN PERFORM public.log_punch('meeting_'||act,false,_device,_ua,NULL,NULL,_acc,NULL,ARRAY['invalid_location']); RETURN json_build_object('error','A fresh location is required. Refresh the page and allow location access.'); END IF;
 SELECT * INTO off FROM public.office_settings WHERE id=1; d:=public.distance_m(_lat,_lng,off.latitude,off.longitude);
 IF _captured_at IS NULL OR abs(extract(epoch FROM now())*1000-_captured_at)>30000 THEN PERFORM public.log_punch('meeting_'||act,false,_device,_ua,_lat,_lng,_acc,d,ARRAY['stale_location']); RETURN json_build_object('error','Location could not be verified. Refresh this page, enable automatic date and time on your phone, then try again.','code','stale_location'); END IF;
 IF _acc IS NULL OR NOT (_acc>0 AND _acc<=150) THEN PERFORM public.log_punch('meeting_'||act,false,_device,_ua,_lat,_lng,_acc,d,ARRAY['low_accuracy']); RETURN json_build_object('error','Your phone GPS is not accurate enough right now. Move to an open area and tap again.','code','low_accuracy'); END IF;
 device_error:=public.punch_device_error(_device,_ua,public.has_feature_access(uid,'device_approval'));
 IF device_error IS NOT NULL THEN PERFORM public.log_punch(CASE WHEN device_error LIKE '%waiting%' THEN 'device_pending' ELSE 'device_blocked' END,false,_device,_ua,_lat,_lng,_acc,d); RETURN json_build_object('error',device_error); END IF;
 IF public.has_feature_access(uid,'meeting_location') AND (d IS NULL OR d>off.radius_m) THEN PERFORM public.log_punch('meeting_'||act,false,_device,_ua,_lat,_lng,_acc,d); RETURN json_build_object('error',format('You are %s m away from the office. This action is only allowed inside the office area.',round(coalesce(d,0))),'distance_m',round(d),'code','outside_office'); END IF;
 IF act='out' THEN INSERT INTO public.work_outings(user_id,attendance_id,reason,out_lat,out_lng,out_distance_m) VALUES(uid,att.id,r,_lat,_lng,round(d)) RETURNING * INTO ow;
 ELSE UPDATE public.work_outings SET back_at=now(),back_lat=_lat,back_lng=_lng,back_distance_m=round(d) WHERE id=ow.id RETURNING * INTO ow; END IF;
 PERFORM public.log_punch('meeting_'||act,true,_device,_ua,_lat,_lng,_acc,d);
 RETURN json_build_object('action',act,'record_id',ow.id,'saved_at',CASE WHEN act='out' THEN ow.out_at ELSE ow.back_at END);
END $$;
CREATE OR REPLACE FUNCTION public.admin_cleanup_records(_kind text, _ids uuid[], _preview boolean DEFAULT true) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); eligible uuid[]; affected integer; linked integer:=0;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
 IF coalesce(cardinality(_ids),0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Select 1 to 500 records'; END IF;
 IF _kind='attendance' THEN SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO eligible FROM public.attendance WHERE id=ANY(_ids) AND check_out_at IS NOT NULL AND (user_id<>'a801c15f-9272-4a76-9832-1e774f162da0'::uuid OR uid=user_id); SELECT count(*) INTO linked FROM public.work_outings WHERE attendance_id=ANY(eligible);
 ELSIF _kind='work_outings' THEN SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO eligible FROM public.work_outings WHERE id=ANY(_ids) AND back_at IS NOT NULL;
 ELSIF _kind='punch_events' THEN SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO eligible FROM public.punch_events WHERE id=ANY(_ids);
 ELSIF _kind='audit_log' THEN SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO eligible FROM public.audit_log WHERE id=ANY(_ids) AND created_at<now()-interval '30 days';
 ELSE RAISE EXCEPTION 'Unsupported record type'; END IF;
 affected:=cardinality(eligible);
 IF NOT _preview THEN
  IF _kind='attendance' THEN DELETE FROM public.attendance WHERE id=ANY(eligible) AND check_out_at IS NOT NULL;
  ELSIF _kind='work_outings' THEN DELETE FROM public.work_outings WHERE id=ANY(eligible) AND back_at IS NOT NULL;
  ELSIF _kind='punch_events' THEN DELETE FROM public.punch_events WHERE id=ANY(eligible);
  ELSE DELETE FROM public.audit_log WHERE id=ANY(eligible) AND created_at<now()-interval '30 days'; END IF;
  GET DIAGNOSTICS affected=ROW_COUNT;
  INSERT INTO public.audit_log(actor_id,table_name,action,new_data) VALUES(uid,'data_cleanup','DELETE',jsonb_build_object('category',_kind,'deleted',affected,'linked_outings',linked));
 END IF;
 RETURN json_build_object('count',affected,'linked_outings',linked,'preview',_preview);
END $$;
REVOKE ALL ON FUNCTION public.admin_cleanup_records(text,uuid[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_records(text,uuid[],boolean) TO authenticated;