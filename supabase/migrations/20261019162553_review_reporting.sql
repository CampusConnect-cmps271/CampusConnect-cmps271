-- SCRUM-175 / SP2-52: report course reviews and moderate them without
-- destroying the review/report audit trail.
begin;

alter table public.course_reviews
  add column status text not null default 'published'
    check (status in ('published', 'removed')),
  add column removed_at timestamptz;

alter table public.course_reviews
  add constraint course_reviews_removal_pair
  check (
    (status = 'published' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  );

create index course_reviews_published_course_created_idx
on public.course_reviews (course_id, created_at desc, id)
where status = 'published';

drop policy if exists "Signed-in students can read course reviews"
on public.course_reviews;
create policy "Students can read published and own course reviews"
on public.course_reviews
for select
to authenticated
using (
  status = 'published'
  or student_id = (select auth.uid())
  or public.current_user_role() in ('moderator', 'administrator')
);

-- The live aggregate view is introduced by SCRUM-171. When that stacked
-- migration is present, make its definition explicitly ignore removed rows.
do $$
begin
  if to_regclass('public.course_rating_averages') is not null then
    execute $view$
      create or replace view public.course_rating_averages
      with (security_invoker = true)
      as
      select
        c.id as course_id,
        count(r.id) as review_count,
        avg(r.difficulty_rating) as average_difficulty,
        avg(r.workload_rating) as average_workload,
        avg(r.usefulness_rating) as average_usefulness,
        avg(r.overall_rating) as average_overall
      from public.courses c
      left join public.course_reviews r
        on r.course_id = c.id and r.status = 'published'
      group by c.id
    $view$;
  end if;
end;
$$;

alter table public.content_reports
  add column review_id uuid references public.course_reviews(id) on delete cascade;

alter table public.content_reports
  drop constraint content_reports_one_target,
  add constraint content_reports_one_target
    check (num_nonnulls(post_id, comment_id, review_id) = 1);

create unique index content_reports_reporter_review_unique
on public.content_reports (reporter_id, review_id)
where review_id is not null;

drop policy if exists "Students can report visible content once"
on public.content_reports;
create policy "Students can report visible content once"
on public.content_reports
for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and status = 'open'
  and resolved_at is null
  and resolved_by is null
  and not public.is_current_user_suspended()
  and (
    (
      post_id is not null
      and exists (
        select 1 from public.posts
        where posts.id = content_reports.post_id
          and posts.status = 'published'
      )
    )
    or
    (
      comment_id is not null
      and exists (
        select 1
        from public.post_comments c
        join public.posts p on p.id = c.post_id
        where c.id = content_reports.comment_id
          and c.status = 'published'
          and p.status = 'published'
      )
    )
    or
    (
      review_id is not null
      and exists (
        select 1 from public.course_reviews r
        where r.id = content_reports.review_id
          and r.status = 'published'
          and r.student_id <> (select auth.uid())
      )
    )
  )
);

drop function public.moderation_queue();
create function public.moderation_queue()
returns table (
  target_type text,
  target_id uuid,
  post_id uuid,
  course_code text,
  author_id uuid,
  report_count bigint,
  reasons text[],
  preview text,
  oldest_reported_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_user_role()::text, '') not in ('moderator', 'administrator') then
    raise exception 'Moderator role required' using errcode = '42501';
  end if;

  return query
  select q.*
  from (
    select
      'post'::text as target_type,
      p.id as target_id,
      p.id as post_id,
      null::text as course_code,
      p.author_id,
      count(cr.id) as report_count,
      array_agg(distinct cr.reason order by cr.reason) as reasons,
      left(p.title || E'\n' || p.body, 240) as preview,
      min(cr.created_at) as oldest_reported_at
    from public.content_reports cr
    join public.posts p on p.id = cr.post_id
    where cr.status = 'open' and cr.post_id is not null
    group by p.id, p.author_id, p.title, p.body

    union all

    select
      'comment'::text,
      c.id,
      c.post_id,
      null::text,
      c.author_id,
      count(cr.id),
      array_agg(distinct cr.reason order by cr.reason),
      left(c.body, 240),
      min(cr.created_at)
    from public.content_reports cr
    join public.post_comments c on c.id = cr.comment_id
    where cr.status = 'open' and cr.comment_id is not null
    group by c.id, c.post_id, c.author_id, c.body

    union all

    select
      'review'::text,
      r.id,
      null::uuid,
      c.code,
      r.student_id,
      count(cr.id),
      array_agg(distinct cr.reason order by cr.reason),
      left(r.body, 240),
      min(cr.created_at)
    from public.content_reports cr
    join public.course_reviews r on r.id = cr.review_id
    join public.courses c on c.id = r.course_id
    where cr.status = 'open' and cr.review_id is not null
    group by r.id, r.student_id, r.body, c.code
  ) q
  order by q.oldest_reported_at asc, q.target_id;
end;
$$;

revoke all on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

create or replace function public.moderate_reported_content(
  report_target_type text,
  report_target_id uuid,
  decision text,
  decision_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_report_count integer;
begin
  if coalesce(public.current_user_role()::text, '') not in ('moderator', 'administrator') then
    raise exception 'Moderator role required' using errcode = '42501';
  end if;

  if report_target_type not in ('post', 'comment', 'review')
    or decision not in ('remove', 'dismiss')
    or char_length(trim(coalesce(decision_reason, ''))) not between 3 and 500
  then
    raise exception 'Invalid moderation decision' using errcode = '22023';
  end if;

  select count(*) into open_report_count
  from public.content_reports r
  where r.status = 'open'
    and (
      (report_target_type = 'post' and r.post_id = report_target_id)
      or (report_target_type = 'comment' and r.comment_id = report_target_id)
      or (report_target_type = 'review' and r.review_id = report_target_id)
    );

  if open_report_count = 0 then
    raise exception 'No open reports found' using errcode = 'P0002';
  end if;

  if decision = 'remove' and report_target_type = 'post' then
    update public.posts
    set status = 'removed'
    where id = report_target_id and status = 'published';
  elsif decision = 'remove' and report_target_type = 'comment' then
    update public.post_comments
    set status = 'removed', removed_at = now()
    where id = report_target_id and status = 'published';
  elsif decision = 'remove' then
    update public.course_reviews
    set status = 'removed', removed_at = now()
    where id = report_target_id and status = 'published';
  end if;

  update public.content_reports r
  set status = case when decision = 'remove' then 'removed' else 'dismissed' end,
      resolved_at = now(),
      resolved_by = auth.uid(),
      resolution_reason = trim(decision_reason)
  where r.status = 'open'
    and (
      (report_target_type = 'post' and r.post_id = report_target_id)
      or (report_target_type = 'comment' and r.comment_id = report_target_id)
      or (report_target_type = 'review' and r.review_id = report_target_id)
    );

  perform public.write_audit_log(
    case when decision = 'remove' then 'content.removed' else 'reports.dismissed' end,
    report_target_type,
    report_target_id,
    trim(decision_reason),
    jsonb_build_object('closed_report_count', open_report_count)
  );
end;
$$;

revoke all on function public.moderate_reported_content(text, uuid, text, text)
from public, anon;
grant execute on function public.moderate_reported_content(text, uuid, text, text)
to authenticated;

notify pgrst, 'reload schema';
commit;
