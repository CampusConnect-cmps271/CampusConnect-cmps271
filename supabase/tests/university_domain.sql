-- Safe to run in the Supabase SQL Editor: creates no accounts or persistent data.
-- Run as the default SQL Editor role; hosted projects disallow switching to Auth's role.
begin;

do $$
declare
  test_case record;
  response jsonb;
  tested integer := 0;
begin
  if not has_schema_privilege('supabase_auth_admin', 'public', 'usage')
     or not has_function_privilege('supabase_auth_admin',
       'public.hook_restrict_university_email(jsonb)', 'execute') then
    raise exception 'Supabase Auth is missing permission to execute the hook';
  end if;
  if has_function_privilege('anon',
       'public.hook_restrict_university_email(jsonb)', 'execute')
     or has_function_privilege('authenticated',
       'public.hook_restrict_university_email(jsonb)', 'execute') then
    raise exception 'Anonymous or authenticated clients must not execute the hook directly';
  end if;

  for test_case in
    select * from (values
      ('{"user":{"email":"student@mail.aub.edu"}}'::jsonb, true),
      ('{"user":{"email":"STUDENT@MAIL.AUB.EDU"}}'::jsonb, true),
      ('{"user":{"email":"student.name+test@mail.aub.edu"}}'::jsonb, true),
      ('{"user":{"email":"student@gmail.com"}}'::jsonb, false),
      ('{"user":{"email":"student@aub.edu"}}'::jsonb, false),
      ('{"user":{"email":"student@sub.mail.aub.edu"}}'::jsonb, false),
      ('{"user":{"email":"student@mail.aub.edu.example.com"}}'::jsonb, false),
      ('{"user":{"email":"student@mailxaubxedu"}}'::jsonb, false),
      ('{"user":{"email":"student@MAIL.AUB.EDU.evil"}}'::jsonb, false),
      ('{"user":{"email":"@mail.aub.edu"}}'::jsonb, false),
      ('{"user":{"email":"student@@mail.aub.edu"}}'::jsonb, false),
      ('{"user":{"email":"student@mail.aub.edu "}}'::jsonb, false),
      ('{"user":{"email":" student@mail.aub.edu"}}'::jsonb, false),
      ('{"user":{"email":"student name@mail.aub.edu"}}'::jsonb, false),
      ('{"user":{"email":"student@mail.aub.edu\n"}}'::jsonb, false),
      ('{"user":{"email":""}}'::jsonb, false),
      ('{"user":{"email":null}}'::jsonb, false),
      ('{"user":{"email":123}}'::jsonb, false),
      ('{"user":{}}'::jsonb, false),
      ('{}'::jsonb, false),
      ('null'::jsonb, false),
      ('{"user":{"email":"outsider@gmail.com","user_metadata":{"email":"student@mail.aub.edu"},"app_metadata":{"provider":"google"}}}'::jsonb, false)
    ) as cases(payload, allowed)
  loop
    response := public.hook_restrict_university_email(test_case.payload);
    if test_case.allowed then
      if response is distinct from '{}'::jsonb then
        raise exception 'Expected signup to be allowed for %, got %', test_case.payload, response;
      end if;
    elsif response #>> '{error,http_code}' is distinct from '403'
       or response #>> '{error,message}' is distinct from
          'Registration is limited to @mail.aub.edu email addresses.' then
      raise exception 'Expected signup to be rejected for %, got %', test_case.payload, response;
    end if;
    tested := tested + 1;
  end loop;
  raise notice 'Passed % university-domain cases.', tested;
end;
$$;

rollback;
