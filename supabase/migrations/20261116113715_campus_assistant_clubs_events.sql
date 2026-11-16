-- SCRUM-254: let the campus assistant find verified clubs and upcoming events,
-- by keyword and by meaning, the same way it finds AUB pages and courses.
--
-- The read policies on these tables are wider than what the assistant may say:
-- an organizer can read their own draft and cancelled events, and every signed-in
-- student can read pending and rejected clubs. So each function filters on its
-- own (published, not yet ended / verified) instead of relying on row-level
-- security alone. The functions still run as the caller, so RLS applies on top.
begin;

-- 768 numbers per text, null until `npm run embed:campus-content` embeds the row.
alter table public.clubs add column embedding extensions.vector(768);
alter table public.events add column embedding extensions.vector(768);

create index clubs_embedding_idx
  on public.clubs using hnsw (embedding extensions.vector_cosine_ops);
create index events_embedding_idx
  on public.events using hnsw (embedding extensions.vector_cosine_ops);

-- A vector describes the text it was made from. When that text changes the
-- vector is wrong, so drop it (clear_stale_embedding comes from the
-- 20261030100000 migration); the backfill embeds the row again. Columns that are
-- not part of the embedded text (times, status, registration link) leave it alone.
create trigger clubs_clear_stale_embedding
  before update of name, category, description on public.clubs
  for each row when (
    old.name is distinct from new.name
    or old.category is distinct from new.category
    or old.description is distinct from new.description
  )
  execute function public.clear_stale_embedding();

create trigger events_clear_stale_embedding
  before update of title, description, location, category, club_name on public.events
  for each row when (
    old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.location is distinct from new.location
    or old.category is distinct from new.category
    or old.club_name is distinct from new.club_name
  )
  execute function public.clear_stale_embedding();

-- Keyword search over verified clubs: any term matches, best match first, the
-- name weighted above the category and description.
create function public.search_campus_clubs(p_query text, p_limit integer default 3)
returns table (
  slug text, name text, category text, description text,
  public_website text, relevance real
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
    select c.slug, c.name, c.category, c.description, c.public_website,
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::regconfig, c.name), 'A') ||
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::regconfig, c.category || ' ' || c.description), 'B') as doc
    from public.clubs c
    where c.verification_status = 'verified'
  )
  select i.slug, i.name, i.category, pg_catalog.left(i.description, 800), i.public_website,
    pg_catalog.ts_rank_cd(i.doc, q.terms)
  from indexed i cross join search q
  where q.terms is not null and i.doc @@ q.terms
  order by 6 desc, i.slug
  limit least(greatest(coalesce(p_limit, 3), 1), 5);
$$;

comment on function public.search_campus_clubs(text, integer) is
  'Invoker/RLS keyword search over verified clubs for the campus assistant: english config, any term matches, name weighted above category/description, query max 500 characters, 1..5 rows, descriptions cut to 800 characters. Pending and rejected clubs are never returned.';

-- Keyword search over published events that have not ended. Drafts, cancelled
-- and past events are never returned, even to their organizer.
create function public.search_campus_events(p_query text, p_limit integer default 3)
returns table (
  id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz,
  location text, category text, club_name text, registration_url text, relevance real
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
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.location,
      e.category, e.club_name, e.registration_url,
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::regconfig, e.title || ' ' || coalesce(e.club_name, '')), 'A') ||
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::regconfig, e.category || ' ' || e.location || ' ' || e.description), 'B') as doc
    from public.events e
    where e.status = 'published' and e.ends_at >= pg_catalog.now()
  )
  select i.id, i.title, pg_catalog.left(i.description, 800), i.starts_at, i.ends_at,
    i.location, i.category, i.club_name, i.registration_url,
    pg_catalog.ts_rank_cd(i.doc, q.terms)
  from indexed i cross join search q
  where q.terms is not null and i.doc @@ q.terms
  order by 10 desc, i.starts_at, i.id
  limit least(greatest(coalesce(p_limit, 3), 1), 5);
$$;

comment on function public.search_campus_events(text, integer) is
  'Invoker/RLS keyword search over published events that have not ended, for the campus assistant: english config, any term matches, title/club weighted above category/location/description, query max 500 characters, 1..5 rows, descriptions cut to 800 characters. Drafts, cancelled and past events are never returned.';

-- Meaning search: same columns as the keyword functions, relevance is the cosine
-- similarity (1 identical, 0 unrelated); rows below p_min_similarity and rows
-- without an embedding are dropped.
create function public.search_campus_clubs_semantic(
  p_embedding extensions.vector(768),
  p_limit integer default 5,
  p_min_similarity real default 0.5
)
returns table (
  slug text, name text, category text, description text,
  public_website text, relevance real
)
language sql stable security invoker
set search_path = ''
as $$
  select c.slug, c.name, c.category, pg_catalog.left(c.description, 800), c.public_website,
    (1 - (c.embedding operator(extensions.<=>) p_embedding))::real
  from public.clubs c
  where c.verification_status = 'verified'
    and c.embedding is not null
    and 1 - (c.embedding operator(extensions.<=>) p_embedding) >= coalesce(p_min_similarity, 0.5)
  order by c.embedding operator(extensions.<=>) p_embedding, c.slug
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

comment on function public.search_campus_clubs_semantic(extensions.vector, integer, real) is
  'Invoker/RLS meaning search over verified clubs: cosine similarity to the query embedding, rows below p_min_similarity (default 0.5) dropped, rows without an embedding ignored, 1..10 rows, descriptions cut to 800 characters.';

create function public.search_campus_events_semantic(
  p_embedding extensions.vector(768),
  p_limit integer default 5,
  p_min_similarity real default 0.5
)
returns table (
  id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz,
  location text, category text, club_name text, registration_url text, relevance real
)
language sql stable security invoker
set search_path = ''
as $$
  select e.id, e.title, pg_catalog.left(e.description, 800), e.starts_at, e.ends_at,
    e.location, e.category, e.club_name, e.registration_url,
    (1 - (e.embedding operator(extensions.<=>) p_embedding))::real
  from public.events e
  where e.status = 'published'
    and e.ends_at >= pg_catalog.now()
    and e.embedding is not null
    and 1 - (e.embedding operator(extensions.<=>) p_embedding) >= coalesce(p_min_similarity, 0.5)
  order by e.embedding operator(extensions.<=>) p_embedding, e.id
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

comment on function public.search_campus_events_semantic(extensions.vector, integer, real) is
  'Invoker/RLS meaning search over published events that have not ended: cosine similarity to the query embedding, rows below p_min_similarity (default 0.5) dropped, rows without an embedding ignored, 1..10 rows, descriptions cut to 800 characters. Drafts, cancelled and past events are never returned.';

revoke all on function public.search_campus_clubs(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.search_campus_clubs(text, integer) to authenticated, service_role;

revoke all on function public.search_campus_events(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.search_campus_events(text, integer) to authenticated, service_role;

revoke all on function public.search_campus_clubs_semantic(extensions.vector, integer, real)
from public, anon, authenticated, service_role;
grant execute on function public.search_campus_clubs_semantic(extensions.vector, integer, real)
to authenticated, service_role;

revoke all on function public.search_campus_events_semantic(extensions.vector, integer, real)
from public, anon, authenticated, service_role;
grant execute on function public.search_campus_events_semantic(extensions.vector, integer, real)
to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
