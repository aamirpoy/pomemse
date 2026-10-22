CREATE OR REPLACE FUNCTION public.log_punch(_action text, _ok boolean, _device text, _ua text, _lat double precision, _lng double precision, _acc double precision, _dist double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  h json;
  v_ip text;
  f text[] := '{}';
  dev text := nullif(left(trim(coalesce(_device,'')),100),'');
  prev public.punch_events;
  o public.office_settings;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  v_ip := trim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-forwarded-for', h->>'x-real-ip', ''), ',', 1));
  v_ip := nullif(v_ip,'');
  select * into o from public.office_settings where id = 1;
  if dev is null then f := f || 'no_device_id'; end if;
  if dev is not null and exists (select 1 from public.punch_events pe where pe.user_id = uid and pe.device_id is not null)
     and not exists (select 1 from public.punch_events pe where pe.user_id = uid and pe.device_id = dev) then f := f || 'new_device'; end if;
  if dev is not null and exists (select 1 from public.punch_events pe where pe.device_id = dev and pe.user_id <> uid and pe.created_at > now() - interval '12 hours') then f := f || 'shared_device'; end if;
  if v_ip is not null and exists (select 1 from public.punch_events pe where pe.ip = v_ip and pe.user_id <> uid and pe.created_at > now() - interval '10 minutes') then f := f || 'shared_ip'; end if;
  if not _ok then f := f || 'outside_office'; end if;
  if _dist is not null and _dist > greatest(o.radius_m * 10, 2000) then f := f || 'far_away'; end if;
  if _acc is not null and _acc > 150 then f := f || 'low_accuracy'; end if;
  if _acc is not null and _acc = 0 then f := f || 'fake_gps_sign'; end if;
  if (select count(*) from public.punch_events pe where pe.user_id = uid and not pe.success and pe.created_at > now() - interval '30 minutes') >= 2 then f := f || 'repeated_failures'; end if;
  select * into prev from public.punch_events pe where pe.user_id = uid and pe.lat is not null order by pe.created_at desc limit 1;
  if prev.id is not null and _lat is not null and extract(epoch from now() - prev.created_at) between 1 and 3600
     and public.distance_m(_lat,_lng,prev.lat,prev.lng) / extract(epoch from now() - prev.created_at) > 70 then f := f || 'impossible_travel'; end if;
  insert into public.punch_events(user_id, action, success, device_id, user_agent, ip, lat, lng, accuracy_m, distance_m, flags, status)
  values (uid, _action, _ok, dev, left(_ua,300), v_ip, _lat, _lng, _acc, round(_dist), f, case when cardinality(f) = 0 then 'reviewed' else 'new' end);
end $function$;