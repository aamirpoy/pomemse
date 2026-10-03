create type public.app_role as enum ('admin','employee');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "read own roles or admin" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  employee_code text,
  department text,
  email text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "read own profile or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin updates profiles" on public.profiles for update to authenticated
using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.office_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Office',
  latitude double precision not null,
  longitude double precision not null,
  radius_m int not null default 150,
  updated_at timestamptz not null default now()
);
grant select, update on public.office_settings to authenticated;
grant all on public.office_settings to service_role;
alter table public.office_settings enable row level security;
create policy "signed in read office" on public.office_settings for select to authenticated using (true);
create policy "admin update office" on public.office_settings for update to authenticated
using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into public.office_settings (id, name, latitude, longitude, radius_m)
values (1, 'Ramhan Island Office', 24.5388351, 54.5245462, 150);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  check_in_at timestamptz not null default now(),
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_distance_m int,
  check_out_at timestamptz,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_distance_m int
);
create index on public.attendance (user_id, check_in_at desc);
grant select on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;
create policy "read own attendance or admin" on public.attendance for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)))
$$;

create or replace function public.clock_action(_lat double precision, _lng double precision)
returns json language plpgsql security definer set search_path = public as $$
declare
  o public.office_settings;
  d double precision;
  open_row public.attendance;
  uid uuid := auth.uid();
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
    insert into public.attendance (user_id, check_in_lat, check_in_lng, check_in_distance_m)
    values (uid, _lat, _lng, round(d)) returning * into open_row;
    return json_build_object('action','check_in','distance', round(d));
  else
    update public.attendance set check_out_at = now(), check_out_lat = _lat, check_out_lng = _lng,
      check_out_distance_m = round(d) where id = open_row.id;
    return json_build_object('action','check_out','distance', round(d));
  end if;
end $$;
revoke all on function public.clock_action(double precision, double precision) from public, anon;
grant execute on function public.clock_action(double precision, double precision) to authenticated;