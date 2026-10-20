-- Read-only verification. Run as the default Supabase SQL Editor role.
-- These checks do not create posts/accounts or modify existing data.
select
  (select count(*) from public.posts) as total_posts,
  (select count(*) from public.posts where status = 'published') as published_posts,
  (select count(*) from public.posts where status = 'deleted') as deleted_posts;

select p.proname, p.prosecdef as security_definer, p.provolatile, p.proconfig,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'execute') as anonymous_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'search_published_posts';

select indexname, indexdef from pg_indexes
where schemaname = 'public' and indexname = 'posts_published_search_idx';

-- Replace the example keywords with a topic in your own published posts.
select id, title, relevance from public.search_published_posts('study', 1, 20);
select id, title, relevance from public.search_published_posts('المكتبة', 1, 20);

-- Must return no rows, including when run by the table owner.
select r.id from public.search_published_posts('study', 1, 50) r
join public.posts p on p.id = r.id where p.status <> 'published';
