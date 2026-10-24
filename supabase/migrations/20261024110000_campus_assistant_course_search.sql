-- SCRUM-51: let the campus assistant look up catalogue courses.
begin;

-- Same shape as search_campus_chunks: any term matches, best match first.
-- Runs as the caller, so the courses read policy applies.
create function public.search_campus_courses(p_query text, p_limit integer default 3)
returns table (
  code text, name text, department text, credits numeric,
  prerequisites text, description text, relevance real
)
language sql stable security invoker
set search_path = ''
as $$
  with search as (
    select nullif(pg_catalog.replace(
      pg_catalog.plainto_tsquery('pg_catalog.english'::regconfig,
        pg_catalog.left(pg_catalog.btrim(coalesce(p_query, '')), 500))::text,
      ' & ', ' | '), '')::pg_catalog.tsquery as terms
  ), indexed as (
    select c.*,
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::regconfig, c.code || ' ' || c.name), 'A') ||
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::regconfig, c.department || ' ' || c.description), 'B') as doc
    from public.courses c
  )
  select i.code, i.name, i.department, i.credits, i.prerequisites,
    -- Long descriptions are cut: the assistant only needs the gist.
    pg_catalog.left(i.description, 800),
    pg_catalog.ts_rank_cd(i.doc, q.terms)
  from indexed i cross join search q
  where q.terms is not null and i.doc @@ q.terms
  order by 7 desc, i.code
  limit least(greatest(coalesce(p_limit, 3), 1), 5);
$$;

comment on function public.search_campus_courses(text, integer) is
  'Invoker/RLS keyword search over the course catalogue for the campus assistant: english config, any term matches, code/name weighted above department/description, query max 500 characters, 1..5 rows, descriptions cut to 800 characters.';

revoke all on function public.search_campus_courses(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.search_campus_courses(text, integer)
to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
