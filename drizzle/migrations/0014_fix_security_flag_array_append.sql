CREATE OR REPLACE FUNCTION public.log_punch(_action text,_ok boolean,_device text,_ua text,_lat double precision,_lng double precision,_acc double precision,_dist double precision) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); h json; v_ip text; f text[]:='{}'; dev text:=nullif(left(trim(coalesce(_device,'')),100),''); prev public.punch_events; o public.office_settings;
BEGIN
 BEGIN h:=current_setting('request.headers',true)::json; EXCEPTION WHEN OTHERS THEN h:=NULL; END;
 v_ip:=nullif(trim(split_part(coalesce(h->>'cf-connecting-ip',h->>'x-forwarded-for',h->>'x-real-ip',''),',',1)),'');
 SELECT * INTO o FROM public.office_settings WHERE id=1;
 IF dev IS NULL THEN f:=array_append(f,'no_device_id'); END IF;
 IF dev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trusted_devices t WHERE t.user_id=uid AND t.device_id=dev) AND EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.user_id=uid AND pe.device_id IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.user_id=uid AND pe.device_id=dev) THEN f:=array_append(f,'new_device'); END IF;
 IF dev IS NOT NULL AND (EXISTS(SELECT 1 FROM public.trusted_devices t WHERE t.device_id=dev AND t.user_id<>uid) OR EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.device_id=dev AND pe.user_id<>uid AND pe.created_at>now()-interval '12 hours')) THEN f:=array_append(f,'shared_device'); END IF;
 IF v_ip IS NOT NULL AND EXISTS(SELECT 1 FROM public.punch_events pe WHERE pe.ip=v_ip AND pe.user_id<>uid AND pe.created_at>now()-interval '10 minutes') THEN f:=array_append(f,'shared_ip'); END IF;
 IF _dist IS NOT NULL AND _dist>o.radius_m THEN f:=array_append(f,'outside_office'); END IF;
 IF _action='device_pending' THEN f:=array_append(f,'device_pending'); END IF;
 IF _action='device_blocked' THEN f:=array_append(f,'device_blocked'); END IF;
 IF _dist IS NOT NULL AND _dist>greatest(o.radius_m*10,2000) THEN f:=array_append(f,'far_away'); END IF;
 IF _acc IS NOT NULL AND _acc>150 THEN f:=array_append(f,'low_accuracy'); END IF;
 IF _acc=0 THEN f:=array_append(f,'fake_gps_sign'); END IF;
 IF (SELECT count(*) FROM public.punch_events pe WHERE pe.user_id=uid AND NOT pe.success AND pe.created_at>now()-interval '30 minutes')>=2 THEN f:=array_append(f,'repeated_failures'); END IF;
 SELECT * INTO prev FROM public.punch_events pe WHERE pe.user_id=uid AND pe.lat IS NOT NULL ORDER BY pe.created_at DESC LIMIT 1;
 IF prev.id IS NOT NULL AND _lat IS NOT NULL AND extract(epoch FROM now()-prev.created_at) BETWEEN 1 AND 3600 AND public.distance_m(_lat,_lng,prev.lat,prev.lng)/extract(epoch FROM now()-prev.created_at)>70 THEN f:=array_append(f,'impossible_travel'); END IF;
 INSERT INTO public.punch_events(user_id,action,success,device_id,user_agent,ip,lat,lng,accuracy_m,distance_m,flags,status) VALUES(uid,_action,_ok,dev,left(_ua,300),v_ip,_lat,_lng,_acc,round(_dist),f,CASE WHEN cardinality(f)=0 THEN 'reviewed' ELSE 'new' END);
END $$;