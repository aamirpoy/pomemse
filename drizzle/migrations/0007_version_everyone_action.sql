CREATE OR REPLACE FUNCTION public.set_version_everyone(_feature text,_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
 if auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') then raise exception 'Admins only'; end if;
 if _feature NOT IN ('device_security','meeting_location','admin_notes') OR _feature IS NULL OR _enabled IS NULL then raise exception 'Invalid update'; end if;
 INSERT INTO public.feature_rollouts(feature_key,enabled_all) VALUES(_feature,_enabled) ON CONFLICT(feature_key) DO UPDATE SET enabled_all=excluded.enabled_all;
 DELETE FROM public.feature_access WHERE feature_key=_feature;
end $$;
REVOKE ALL ON FUNCTION public.set_version_everyone(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_version_everyone(text,boolean) TO authenticated,service_role;