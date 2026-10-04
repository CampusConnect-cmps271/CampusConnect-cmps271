-- SCRUM-82: allow new accounts only for the agreed AUB student email domain.
-- Activate this function as the Before User Created hook after applying it.
begin;

create or replace function public.hook_restrict_university_email(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  email text := event #>> '{user,email}';
begin
  if jsonb_typeof(event #> '{user,email}') is distinct from 'string'
     or email !~* '^[^[:space:]@]+@mail[.]aub[.]edu$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Registration is limited to @mail.aub.edu email addresses.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
revoke execute on function public.hook_restrict_university_email(jsonb)
  from public, anon, authenticated;
grant execute on function public.hook_restrict_university_email(jsonb)
  to supabase_auth_admin;

commit;
