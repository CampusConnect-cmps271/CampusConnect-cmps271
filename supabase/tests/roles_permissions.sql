begin;

do $$
declare
  role_names text[];
  policy_count integer;
begin
  select array_agg(enumlabel order by enumsortorder)
  into role_names
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typname = 'app_role';

  if role_names is distinct from array[
    'student',
    'club_representative',
    'moderator',
    'administrator'
  ] then
    raise exception 'Unexpected app_role values: %', role_names;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'user_roles'
  ) then
    raise exception 'public.user_roles does not exist';
  end if;

  select count(*)
  into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'user_roles'
    and policyname in (
      'Users can read their own role',
      'Administrators can read all roles'
    );

  if policy_count <> 2 then
    raise exception 'Expected both user_roles read policies, found %', policy_count;
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created_role'
      and not tgisinternal
  ) then
    raise exception 'New-user role trigger does not exist';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_assign_role(uuid, public.app_role)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute admin_assign_role';
  end if;

  if has_function_privilege(
    'anon',
    'public.admin_assign_role(uuid, public.app_role)',
    'execute'
  ) then
    raise exception 'anon must not execute admin_assign_role';
  end if;

  raise notice 'SCRUM-16 role schema checks passed.';
end;
$$;

rollback;
