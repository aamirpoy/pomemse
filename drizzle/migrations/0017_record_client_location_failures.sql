CREATE OR REPLACE FUNCTION public.report_location_failure(_action text, _device text DEFAULT NULL, _ua text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 IF _action NOT IN ('check_in','check_out','meeting_out','meeting_back') OR _action IS NULL THEN RAISE EXCEPTION 'Invalid attendance action'; END IF;
 PERFORM public.log_punch(_action,false,_device,_ua,NULL,NULL,NULL,NULL,ARRAY['location_unavailable']);
END $$;
REVOKE ALL ON FUNCTION public.report_location_failure(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_location_failure(text,text,text) TO authenticated;