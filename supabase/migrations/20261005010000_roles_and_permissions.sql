-- SCRUM-16: role groups, permission checks, and administrator role assignment.
begin;

do $$
begin
  create type public.app_role as enum (
    'student',
    'club_representative',
    'moderator',
    'administrator'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.user_roles
  where user_id = auth.uid();
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles(user_id, role)
  values (new.id, 'student')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user_role() from public;

drop trigger if exists on_auth_user_created_role on auth.users;
create trigger on_auth_user_created_role
after insert on auth.users
for each row execute function public.handle_new_user_role();

insert into public.user_roles(user_id, role)
select id, 'student'::public.app_role
from auth.users
on conflict (user_id) do nothing;

grant select (user_id, role, updated_at) on public.user_roles to authenticated;

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Administrators can read all roles" on public.user_roles;
create policy "Administrators can read all roles"
on public.user_roles
for select
to authenticated
using (public.current_user_role() = 'administrator');

create or replace function public.admin_list_users(search_term text default null)
returns table (
  user_id uuid,
  email text,
  role public.app_role,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'administrator' then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text, r.role, r.updated_at
  from auth.users u
  join public.user_roles r on r.user_id = u.id
  where search_term is null
     or search_term = ''
     or u.email ilike '%' || search_term || '%'
  order by u.email;
end;
$$;

revoke all on function public.admin_list_users(text) from public;
grant execute on function public.admin_list_users(text) to authenticated;

create or replace function public.admin_assign_role(
  target_user_id uuid,
  new_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'administrator' then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  update public.user_roles
  set role = new_role,
      updated_at = now()
  where user_id = target_user_id;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_assign_role(uuid, public.app_role) from public;
grant execute on function public.admin_assign_role(uuid, public.app_role) to authenticated;

commit;
