
begin;

do $$
declare
  policy_count integer;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'posts'
  ) then
    raise exception 'public.posts does not exist';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'posts'
      and c.relrowsecurity = true
  ) then
    raise exception 'RLS is not enabled on posts';
  end if;

  select count(*)
  into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'posts'
    and policyname in (
      'Students can read published posts',
      'Students can create their own posts'
    );

  if policy_count <> 2 then
    raise exception 'Expected 2 posts policies, found %',
      policy_count;
  end if;

  if not has_table_privilege(
    'authenticated',
    'public.posts',
    'select'
  ) then
    raise exception 'Authenticated users cannot read posts';
  end if;

  if not has_table_privilege(
    'authenticated',
    'public.posts',
    'insert'
  ) then
    raise exception 'Authenticated users cannot create posts';
  end if;

  if has_table_privilege(
    'anon',
    'public.posts',
    'select'
  ) then
    raise exception 'Anonymous users must not read posts';
  end if;

  if has_table_privilege(
    'anon',
    'public.posts',
    'insert'
  ) then
    raise exception 'Anonymous users must not create posts';
  end if;

  raise notice 'SP2-01 posts schema checks passed.';
end;
$$;

rollback;
