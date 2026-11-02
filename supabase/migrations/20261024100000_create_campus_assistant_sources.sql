-- SCRUM-51 / SP3-40: curated official AUB sources and their text chunks.
begin;

-- Written only by the ingestion script (secret key); students can only read.
create table public.campus_sources (
  id text primary key check (id ~ '^[a-z0-9-]{1,64}$'),
  -- Only official aub.edu.lb pages can be stored, and so only they can be cited.
  url text not null unique check (url ~ '^https://([a-z0-9-]+\.)*aub\.edu\.lb/[^\s]*$' and char_length(url) <= 500),
  title text not null check (char_length(title) between 1 and 300),
  publisher text not null check (char_length(publisher) between 1 and 200),
  published_at date,
  retrieved_at timestamptz not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$')
);

create table public.campus_source_chunks (
  id text primary key check (char_length(id) <= 80),
  source_id text not null references public.campus_sources (id) on delete cascade,
  position integer not null check (position >= 0),
  text text not null check (char_length(text) between 1 and 4000),
  unique (source_id, position)
);

alter table public.campus_sources enable row level security;
alter table public.campus_source_chunks enable row level security;

create policy "Students can read campus sources"
  on public.campus_sources for select to authenticated using (true);
create policy "Students can read campus source chunks"
  on public.campus_source_chunks for select to authenticated using (true);

revoke all on public.campus_sources, public.campus_source_chunks from public, anon, authenticated;
grant select on public.campus_sources, public.campus_source_chunks to authenticated;

-- No GIN index: the curated collection is a few dozen rows, so a scan is cheap.
create function public.search_campus_chunks(p_query text, p_limit integer default 5)
returns table (
  chunk_id text, source_id text, url text, title text,
  retrieved_at timestamptz, text text, relevance real
)
language sql stable security invoker
set search_path = ''
as $$
  -- plainto_tsquery ANDs the terms; a question rarely has every word in one
  -- chunk, so OR them and let ts_rank_cd put the chunks matching most first.
  with search as (
    select nullif(pg_catalog.replace(
      pg_catalog.plainto_tsquery('pg_catalog.english'::regconfig,
        pg_catalog.left(pg_catalog.btrim(coalesce(p_query, '')), 500))::text,
      ' & ', ' | '), '')::pg_catalog.tsquery as terms
  )
  select c.id, s.id, s.url, s.title, s.retrieved_at, c.text,
    pg_catalog.ts_rank_cd(pg_catalog.to_tsvector('pg_catalog.english'::regconfig, c.text), q.terms)
  from public.campus_source_chunks c
  join public.campus_sources s on s.id = c.source_id
  cross join search q
  where q.terms is not null
    and pg_catalog.to_tsvector('pg_catalog.english'::regconfig, c.text) @@ q.terms
  order by 7 desc, c.id
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

comment on function public.search_campus_chunks(text, integer) is
  'Invoker/RLS keyword search over campus source chunks: english config (stems English words, passes Arabic tokens through unchanged), any term matches, ranked by ts_rank_cd, query max 500 characters, 1..10 rows. No semantic matching.';

revoke all on function public.search_campus_chunks(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.search_campus_chunks(text, integer)
to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
