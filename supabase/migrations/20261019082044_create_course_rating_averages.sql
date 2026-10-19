-- SCRUM-171 / SP2-48: live aggregates, evaluated using the caller's RLS policies.
begin;

create view public.course_rating_averages
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
left join public.course_reviews r on r.course_id = c.id
group by c.id;

comment on view public.course_rating_averages is
  'Live per-course review count and numeric averages, respecting caller permissions and RLS. Empty courses have count 0 and NULL averages; UI thresholds are applied separately.';
comment on column public.course_rating_averages.review_count is
  'Number of reviews visible to the caller, not the number of joined course rows.';
comment on column public.course_rating_averages.average_difficulty is
  'Arithmetic mean, without display rounding: 1 = easiest; 5 = hardest.';
comment on column public.course_rating_averages.average_workload is
  'Arithmetic mean, without display rounding: 1 = lightest workload; 5 = heaviest.';
comment on column public.course_rating_averages.average_usefulness is
  'Arithmetic mean, without display rounding: 1 = least useful; 5 = most useful.';
comment on column public.course_rating_averages.average_overall is
  'Arithmetic mean, without display rounding: 1 = lowest overall experience; 5 = highest.';

-- Explicit grants avoid depending on Supabase's changing API exposure defaults.
-- The aggregate view is read-only; review writes still go through course_reviews.
revoke all on public.course_rating_averages
from public, anon, authenticated, service_role;
grant select on public.course_rating_averages to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
