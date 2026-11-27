-- Bundle private navigation counts with the existing live identity read.
-- The public function remains an invoker: profile/count reads retain caller RLS.
begin;
create or replace function public.get_my_session_context()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare identity jsonb; profile_name text; header_counts jsonb;
begin
  identity := app_private.my_live_session_identity();
  if identity is null then return null; end if;
  if (identity->>'confirmed')::boolean then
    begin
      select p.full_name into profile_name from public.profiles p
      where p.id=(identity->>'id')::uuid;
    exception when others then profile_name := null;
    end;
    -- Optional display data must never turn an identity-read failure into a
    -- success, or make a count failure reject an otherwise verified identity.
    begin
      header_counts := public.get_my_header_counts();
    exception when others then header_counts := null;
    end;
  end if;
  return identity || jsonb_build_object('profile_name',profile_name,'header_counts',header_counts);
end;
$$;
revoke all on function public.get_my_session_context() from public, anon, authenticated, service_role;
grant execute on function public.get_my_session_context() to authenticated;
comment on function public.get_my_session_context() is
  'Caller-only live session/account state, optional profile and private navigation counts, all under existing ownership/RLS. Never cache across requests.';
notify pgrst, 'reload schema';
commit;
