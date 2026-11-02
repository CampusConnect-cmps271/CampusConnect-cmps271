-- Meaning-based search for the campus assistant: a stored embedding per page
-- chunk and per course, and two search functions that rank by cosine
-- similarity. The keyword functions from the earlier migrations stay as they are.
begin;

create extension if not exists vector with schema extensions;

-- 768 numbers per text (Gemini embedding, reduced size). Null until the
-- backfill script (npm run embed:campus-content) has embedded the row.
alter table public.campus_source_chunks add column embedding extensions.vector(768);
alter table public.courses add column embedding extensions.vector(768);

create index campus_source_chunks_embedding_idx
  on public.campus_source_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index courses_embedding_idx
  on public.courses using hnsw (embedding extensions.vector_cosine_ops);

-- A vector describes the text it was made from. When that text changes the
-- vector is wrong, so drop it; searches skip rows without one until the
-- backfill embeds them again.
create function public.clear_stale_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.embedding := null;
  return new;
end;
$$;

create trigger campus_source_chunks_clear_stale_embedding
  before update of text on public.campus_source_chunks
  for each row when (old.text is distinct from new.text)
  execute function public.clear_stale_embedding();

create trigger courses_clear_stale_embedding
  before update of name, description, department on public.courses
  for each row when (
    old.name is distinct from new.name
    or old.description is distinct from new.description
    or old.department is distinct from new.department
  )
  execute function public.clear_stale_embedding();

revoke all on function public.clear_stale_embedding() from public, anon, authenticated, service_role;

-- Same columns as search_campus_chunks; relevance is the cosine similarity
-- (1 is identical, 0 is unrelated). Rows below p_min_similarity are dropped so
-- an unrelated question finds nothing instead of its nearest neighbour.
create function public.search_campus_chunks_semantic(
  p_embedding extensions.vector(768),
  p_limit integer default 5,
  p_min_similarity real default 0.5
)
returns table (
  chunk_id text, source_id text, url text, title text,
  retrieved_at timestamptz, text text, relevance real
)
language sql stable security invoker
set search_path = ''
as $$
  select c.id, s.id, s.url, s.title, s.retrieved_at, c.text,
    (1 - (c.embedding operator(extensions.<=>) p_embedding))::real
  from public.campus_source_chunks c
  join public.campus_sources s on s.id = c.source_id
  where c.embedding is not null
    and 1 - (c.embedding operator(extensions.<=>) p_embedding) >= coalesce(p_min_similarity, 0.5)
  order by c.embedding operator(extensions.<=>) p_embedding, c.id
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

comment on function public.search_campus_chunks_semantic(extensions.vector, integer, real) is
  'Invoker/RLS meaning search over campus source chunks: cosine similarity to the query embedding, rows below p_min_similarity (default 0.5) dropped, rows without an embedding ignored, 1..10 rows.';

-- Same columns as search_campus_courses, descriptions cut to 800 characters.
create function public.search_campus_courses_semantic(
  p_embedding extensions.vector(768),
  p_limit integer default 5,
  p_min_similarity real default 0.5
)
returns table (
  code text, name text, department text, credits numeric,
  prerequisites text, description text, relevance real
)
language sql stable security invoker
set search_path = ''
as $$
  select c.code, c.name, c.department, c.credits, c.prerequisites,
    pg_catalog.left(c.description, 800),
    (1 - (c.embedding operator(extensions.<=>) p_embedding))::real
  from public.courses c
  where c.embedding is not null
    and 1 - (c.embedding operator(extensions.<=>) p_embedding) >= coalesce(p_min_similarity, 0.5)
  order by c.embedding operator(extensions.<=>) p_embedding, c.code
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

comment on function public.search_campus_courses_semantic(extensions.vector, integer, real) is
  'Invoker/RLS meaning search over the course catalogue: cosine similarity to the query embedding, rows below p_min_similarity (default 0.5) dropped, rows without an embedding ignored, 1..10 rows, descriptions cut to 800 characters.';

revoke all on function public.search_campus_chunks_semantic(extensions.vector, integer, real)
from public, anon, authenticated, service_role;
grant execute on function public.search_campus_chunks_semantic(extensions.vector, integer, real)
to authenticated, service_role;

revoke all on function public.search_campus_courses_semantic(extensions.vector, integer, real)
from public, anon, authenticated, service_role;
grant execute on function public.search_campus_courses_semantic(extensions.vector, integer, real)
to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
