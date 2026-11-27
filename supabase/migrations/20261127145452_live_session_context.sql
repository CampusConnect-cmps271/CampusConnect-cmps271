-- Read only the caller's live Auth state through a private, narrowly scoped
-- helper. The public wrapper retains caller RLS for the optional profile name.
begin;

create schema if not exists app_private authorization postgres;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create function app_private.my_live_session_identity()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  claims jsonb := auth.jwt();
  session_claim text := claims->>'session_id';
  session_id uuid;
  result jsonb;
begin
  if caller_id is null or claims->>'role' is distinct from 'authenticated' or
     not (coalesce(claims->>'aud'='authenticated',false) or
          coalesce(jsonb_typeof(claims->'aud')='array' and (claims->'aud') ? 'authenticated',false)) or
     session_claim is null or session_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
     coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' then
    return null;
  end if;
  if (claims->>'exp')::bigint <= extract(epoch from now()) then return null; end if;
  session_id := session_claim::uuid;

  select jsonb_build_object(
    'id',u.id, 'email',u.email,
    'confirmed',u.email_confirmed_at is not null,
    'metadata_full_name',case when jsonb_typeof(u.raw_user_meta_data->'full_name')='string' then u.raw_user_meta_data->>'full_name' end,
    'metadata_name',case when jsonb_typeof(u.raw_user_meta_data->'name')='string' then u.raw_user_meta_data->>'name' end
  ) into result
  from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=caller_id and s.id=session_id
    and u.deleted_at is null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until <= now())
    and (s.not_after is null or s.not_after > now());
  return result;
end;
$$;
alter function app_private.my_live_session_identity() owner to postgres;
revoke all on function app_private.my_live_session_identity() from public, anon, authenticated, service_role;
grant execute on function app_private.my_live_session_identity() to authenticated;
comment on function app_private.my_live_session_identity() is
  'Private live identity reader. No caller-supplied IDs; checks JWT subject, session ownership/expiry and live user confirmation/ban/deletion state. Metadata is display text only.';

create function public.get_my_session_context()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare identity jsonb; profile_name text;
begin
  identity := app_private.my_live_session_identity();
  if identity is null then return null; end if;
  if (identity->>'confirmed')::boolean then
    -- This query runs as the caller, so profile visibility is still RLS-scoped.
    -- Display-name failure must not undo a successful identity check.
    begin
      select p.full_name into profile_name from public.profiles p
      where p.id=(identity->>'id')::uuid;
    exception when others then profile_name := null;
    end;
  end if;
  return identity || jsonb_build_object('profile_name',profile_name);
end;
$$;
revoke all on function public.get_my_session_context() from public, anon, authenticated, service_role;
grant execute on function public.get_my_session_context() to authenticated;
comment on function public.get_my_session_context() is
  'Authenticated caller-only live session/account state and optional RLS-scoped profile name. Never cache across requests or add arguments selecting another identity.';

notify pgrst, 'reload schema';
commit;
