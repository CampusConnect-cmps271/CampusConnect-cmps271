-- Keep authenticated browsing requests small: one HTTP call per data bundle.
-- All reads retain the caller's RLS and use no service-role privileges.
begin;

create function public.get_my_header_counts()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'messages', public.count_my_unread_conversations(),
    'notifications', (select count(*) from public.notifications n
      where n.recipient_id = (select auth.uid()) and n.read_at is null)
  );
$$;
revoke all on function public.get_my_header_counts() from public, anon;
grant execute on function public.get_my_header_counts() to authenticated;

create function public.browse_course_catalogue(
  p_query text default '', p_code_query text default '',
  p_department text default '', p_page integer default 1,
  p_credits_min numeric default null, p_credits_max numeric default null
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  result jsonb;
  ratings jsonb;
  name_pattern text;
  code_pattern text;
begin
  if p_query is null or p_code_query is null or p_department is null or
     length(p_query) > 120 or length(p_code_query) > 120 or length(p_department) > 200 or
     p_page is null or p_page < 1 or p_page > 10000 or
     (p_credits_min is not null and not (p_credits_min between 0 and 999.99)) or
     (p_credits_max is not null and not (p_credits_max between 0 and 999.99)) or
     p_credits_min > p_credits_max then
    raise exception 'Invalid catalogue filters' using errcode = '22023';
  end if;
  -- Treat user input as literal substring text, including LIKE wildcards.
  name_pattern := '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  code_pattern := '%' || replace(replace(replace(p_code_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  with filtered as materialized (
    -- Keep the count/sort working set narrow; fetch descriptions for 24 rows only.
    select c.id, c.department, c.code from public.courses c
    where (p_query = '' or c.code ilike code_pattern escape '\' or c.name ilike name_pattern escape '\')
      and (p_department = '' or c.department = p_department)
      and (p_credits_min is null or c.credits >= p_credits_min)
      and (p_credits_max is null or c.credits <= p_credits_max)
  ), totals as (
    select count(*) as total, greatest(1, ceil(count(*) / 24.0)::integer) as pages from filtered
  ), bounds as (
    select total, pages, least(p_page, pages) as page from totals
  ), page_rows as (
    select f.* from filtered f order by f.department, f.code, f.id
    limit 24 offset (select (page - 1) * 24 from bounds)
  )
  select jsonb_build_object(
    'total', b.total, 'page', b.page, 'pages', b.pages,
    'courses', coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'code',c.code,'name',c.name,'credits',c.credits,
      'description',c.description,'department',c.department
    ) order by p.department,p.code,p.id) from page_rows p join public.courses c on c.id=p.id), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(d.department order by d.department)
      from public.list_course_departments() d), '[]'::jsonb),
    'semesters', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'synced_at',s.synced_at) order by s.id desc)
      from public.resis_semesters s where s.synced_at is not null), '[]'::jsonb)
  ) into result from bounds b;

  -- Ratings are optional, as in the existing UI. A failed ratings read must
  -- not discard a successfully loaded catalogue. Query cancellation still propagates.
  begin
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into ratings
    from public.course_rating_averages a
    join jsonb_to_recordset(result->'courses') as p(id uuid) on p.id=a.course_id;
  exception when others then ratings := null;
  end;
  return result || jsonb_build_object('ratings',ratings);
end;
$$;
revoke all on function public.browse_course_catalogue(text,text,text,integer,numeric,numeric) from public, anon;
grant execute on function public.browse_course_catalogue(text,text,text,integer,numeric,numeric) to authenticated;

create function public.get_campus_feed_page(
  p_page integer default 1, p_sort text default 'newest', p_category text default ''
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare chosen_category text;
begin
  if p_page is null or p_page < 1 or p_page > 100 or length(p_category)>200 then
    raise exception 'Invalid feed filters' using errcode = '22023';
  end if;
  select c.name into chosen_category from public.categories c where c.name=p_category limit 1;
  return (
    with ranked as materialized (
      select r.* from public.get_ranked_feed_posts(
        p_page,20,case when p_sort='top' then 'top' else 'newest' end,chosen_category
      ) with ordinality r
    )
    select jsonb_build_object(
      'categories',coalesce((select jsonb_agg(c.name order by c.id) from public.categories c),'[]'::jsonb),
      'selectedCategory',coalesce(chosen_category,''),
      'hasMore',exists(select 1 from ranked where ordinality>20),
      'posts',coalesce((select jsonb_agg(jsonb_build_object(
        'id',r.id,'author_id',r.author_id,'title',r.title,'body',r.body,
        'category',r.category,'created_at',r.created_at,'edited_at',r.edited_at,
        'upvote_count',r.upvote_count,
        'comment_count',(select count(*) from public.post_comments c where c.post_id=r.id)
      ) order by r.ordinality) from ranked r where r.ordinality<=20),'[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.get_campus_feed_page(integer,text,text) from public, anon;
grant execute on function public.get_campus_feed_page(integer,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
