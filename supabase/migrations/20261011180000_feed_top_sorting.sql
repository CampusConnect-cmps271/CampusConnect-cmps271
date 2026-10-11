
begin;

create or replace function public.get_ranked_feed_posts(
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort text default 'newest',
  p_category text default null
)
returns table (
  id uuid,
  author_id uuid,
  title text,
  body text,
  category text,
  created_at timestamptz,
  edited_at timestamptz,
  upvote_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.author_id,
    p.title,
    p.body,
    p.category,
    p.created_at,
    p.edited_at,
    count(v.post_id)::bigint as upvote_count
  from public.posts p
  left join public.post_upvotes v
    on v.post_id = p.id
  where p.status = 'published'
    and (
      p_category is null
      or p.category = p_category
    )
  group by
    p.id,
    p.author_id,
    p.title,
    p.body,
    p.category,
    p.created_at,
    p.edited_at
  order by
    case
      when p_sort = 'top'
      then count(v.post_id)
    end desc nulls last,
    p.created_at desc,
    p.id desc
  limit least(greatest(p_page_size, 1), 100) + 1
  offset (
    (greatest(p_page, 1) - 1)
    * least(greatest(p_page_size, 1), 100)
  );
$$;

revoke all on function public.get_ranked_feed_posts(
  integer, integer, text, text
) from public;

grant execute on function public.get_ranked_feed_posts(
  integer, integer, text, text
) to authenticated;

commit;
