-- SCRUM-142: literal keyword search over published post titles and bodies.
begin;

-- Expression index avoids changing the table's columns or write grants.
create index posts_published_search_idx on public.posts using gin ((
  setweight(to_tsvector('pg_catalog.simple'::regconfig, coalesce(title, '')), 'A') ||
  setweight(to_tsvector('pg_catalog.simple'::regconfig, coalesce(body, '')), 'B')
)) where status = 'published';

create function public.search_published_posts(
  p_query text,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  id uuid, author_id uuid, title text, body text, category text,
  created_at timestamptz, edited_at timestamptz, relevance real
)
language sql stable security invoker
set search_path = ''
as $$
  with search as (
    select pg_catalog.plainto_tsquery('pg_catalog.simple'::regconfig,
      pg_catalog.left(pg_catalog.btrim(coalesce(p_query, '')), 200)) as terms
  )
  select p.id, p.author_id, p.title, p.body, p.category, p.created_at, p.edited_at,
    pg_catalog.ts_rank_cd(
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple'::regconfig, coalesce(p.title, '')), 'A') ||
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple'::regconfig, coalesce(p.body, '')), 'B'),
      s.terms
    ) as relevance
  from public.posts p cross join search s
  where p.status = 'published'
    and pg_catalog.numnode(s.terms) > 0
    and (
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple'::regconfig, coalesce(p.title, '')), 'A') ||
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple'::regconfig, coalesce(p.body, '')), 'B')
    ) @@ s.terms
  order by relevance desc, p.created_at desc, p.id desc
  -- One extra row tells the consumer whether another page exists.
  limit least(greatest(coalesce(p_page_size, 20), 1), 50) + 1
  offset (least(greatest(coalesce(p_page, 1), 1), 10000) - 1)
    * least(greatest(coalesce(p_page_size, 20), 1), 50);
$$;

comment on function public.search_published_posts(text, integer, integer) is
  'Invoker/RLS keyword search: simple config for English/Arabic tokens, all terms required, title weight A/body B, relevance/newest/ID order, page size 1..50 plus one lookahead row, page 1..10000, query max 200 characters. No stemming, transliteration or wildcard syntax.';

revoke all on function public.search_published_posts(text, integer, integer)
from public, anon, authenticated, service_role;
grant execute on function public.search_published_posts(text, integer, integer)
to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
