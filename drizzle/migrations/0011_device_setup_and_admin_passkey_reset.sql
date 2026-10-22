CREATE OR REPLACE FUNCTION public.register_my_device(_device text, _ua text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); result public.trusted_devices;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 IF NOT public.has_feature_access(uid,'device_approval') THEN RAISE EXCEPTION 'Registered devices is not enabled for your account'; END IF;
 IF _device IS NULL OR length(_device) < 8 OR length(_device) > 128 THEN RAISE EXCEPTION 'This device could not be identified'; END IF;
 INSERT INTO public.trusted_devices(user_id,device_id,user_agent) VALUES(uid,_device,left(_ua,500)) ON CONFLICT(user_id,device_id) DO NOTHING;
 SELECT * INTO result FROM public.trusted_devices WHERE user_id=uid AND device_id=_device;
 RETURN json_build_object('status',result.status);
END $$;
REVOKE ALL ON FUNCTION public.register_my_device(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_my_device(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_reset_passkeys(_user uuid, _credential uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); removed integer;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
 IF _user='a801c15f-9272-4a76-9832-1e774f162da0'::uuid AND uid<>_user THEN RAISE EXCEPTION 'Only the owner can reset the owner passkeys'; END IF;
 DELETE FROM public.webauthn_credentials WHERE user_id=_user AND (_credential IS NULL OR id=_credential);
 GET DIAGNOSTICS removed = ROW_COUNT;
 DELETE FROM public.biometric_passes WHERE user_id=_user;
 DELETE FROM public.webauthn_challenges WHERE user_id=_user;
 IF removed > 0 THEN
  INSERT INTO public.audit_log(actor_id,target_user_id,table_name,action,old_data,new_data)
  VALUES(uid,_user,'webauthn_credentials','delete',jsonb_build_object('passkeys removed',removed),NULL);
 END IF;
 RETURN json_build_object('removed',removed);
END $$;
REVOKE ALL ON FUNCTION public.admin_reset_passkeys(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_passkeys(uuid,uuid) TO authenticated;