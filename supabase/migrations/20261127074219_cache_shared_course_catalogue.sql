-- A server-only source for the shared course cache. Ordinary clients continue
-- using their existing RLS-scoped RPC; anonymous access is not expanded.
begin;

grant execute on function public.list_course_departments() to service_role;

grant execute on function public.browse_course_catalogue(text,text,text,integer,numeric,numeric) to service_role;

create function public.read_shared_course_catalogue(
  p_query text default '', p_code_query text default '',
  p_department text default '', p_page integer default 1,
  p_credits_min numeric default null, p_credits_max numeric default null
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare bundle jsonb;
begin
  bundle := public.browse_course_catalogue(p_query,p_code_query,p_department,p_page,p_credits_min,p_credits_max);
  -- The server role bypasses RLS. Reproduce the shared semester visibility
  -- rule explicitly, rather than including inactive or unfinished imports.
  return jsonb_build_object(
    'courses',bundle->'courses', 'total',bundle->'total',
    'page',bundle->'page', 'pages',bundle->'pages',
    'departments',bundle->'departments', 'ratings',bundle->'ratings',
    'semesters',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.name,'synced_at',s.synced_at) order by s.id desc)
      from public.resis_semesters s
      where s.active_import_id is not null and s.synced_at is not null),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.read_shared_course_catalogue(text,text,text,integer,numeric,numeric) from public, anon, authenticated;
grant execute on function public.read_shared_course_catalogue(text,text,text,integer,numeric,numeric) to service_role;
comment on function public.read_shared_course_catalogue(text,text,text,integer,numeric,numeric) is
  'Server-only shared catalogue projection: globally readable courses, active semester labels and published rating aggregates. Never add caller-specific data. Change cache scope/invalidate before introducing per-student course visibility.';

notify pgrst, 'reload schema';
commit;
