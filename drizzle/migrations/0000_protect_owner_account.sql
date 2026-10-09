create or replace function public.protect_owner_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := 'a801c15f-9272-4a76-9832-1e774f162da0';
  uid uuid := auth.uid();
begin
  -- server-side admin tools (no session) and the owner himself may proceed
  if uid is null or uid = owner_id then
    return coalesce(new, old);
  end if;
  if TG_TABLE_NAME = 'user_roles' then
    if (TG_OP = 'DELETE' and old.user_id = owner_id)
      or (TG_OP = 'UPDATE' and (old.user_id = owner_id or new.user_id = owner_id)) then
      raise exception 'The owner account cannot be changed by other admins';
    end if;
  elsif TG_TABLE_NAME = 'profiles' then
    if TG_OP = 'DELETE' and old.id = owner_id then
      raise exception 'The owner account cannot be removed by other admins';
    end if;
  elsif TG_TABLE_NAME = 'attendance' then
    if TG_OP = 'DELETE' and old.user_id = owner_id then
      raise exception 'Owner records cannot be removed by other admins';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists protect_owner_roles on public.user_roles;
create trigger protect_owner_roles
before update or delete on public.user_roles
for each row execute function public.protect_owner_account();

drop trigger if exists protect_owner_profile on public.profiles;
create trigger protect_owner_profile
before delete on public.profiles
for each row execute function public.protect_owner_account();

drop trigger if exists protect_owner_attendance on public.attendance;
create trigger protect_owner_attendance
before delete on public.attendance
for each row execute function public.protect_owner_account();