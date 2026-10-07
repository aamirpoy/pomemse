ALTER TABLE public.attendance ADD COLUMN check_in_note text, ADD COLUMN check_out_note text;
DROP FUNCTION public.clock_action(double precision, double precision);
CREATE OR REPLACE FUNCTION public.clock_action(_lat double precision, _lng double precision, _note text DEFAULT NULL)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  o public.office_settings;
  d double precision;
  open_row public.attendance;
  uid uuid := auth.uid();
  n text := nullif(left(trim(coalesce(_note,'')), 500), '');
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into o from public.office_settings where id = 1;
  d := public.distance_m(_lat, _lng, o.latitude, o.longitude);
  if d > o.radius_m then
    raise exception 'You are % m away from the office. You must be within % m.', round(d), o.radius_m;
  end if;
  select * into open_row from public.attendance where user_id = uid and check_out_at is null
    order by check_in_at desc limit 1;
  if open_row.id is null then
    insert into public.attendance (user_id, check_in_lat, check_in_lng, check_in_distance_m, check_in_note)
    values (uid, _lat, _lng, round(d), n) returning * into open_row;
    return json_build_object('action','check_in','distance', round(d));
  else
    update public.attendance set check_out_at = now(), check_out_lat = _lat, check_out_lng = _lng,
      check_out_distance_m = round(d), check_out_note = n where id = open_row.id;
    return json_build_object('action','check_out','distance', round(d));
  end if;
end $function$;
REVOKE EXECUTE ON FUNCTION public.clock_action(double precision, double precision, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.clock_action(double precision, double precision, text) TO authenticated;