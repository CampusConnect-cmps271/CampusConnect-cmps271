-- SCRUM-173: apply rating predicates in Postgres before count/pagination.
begin;

create view public.course_filter_catalogue
with (security_invoker = true)
as
select
  c.id, c.code, c.name, c.credits, c.description, c.department,
  a.review_count,
  case when a.review_count >= 3 then round(a.average_difficulty, 1) end as difficulty,
  case when a.review_count >= 3 then round(a.average_workload, 1) end as workload
from public.courses c
left join public.course_rating_averages a on a.course_id = c.id;

comment on view public.course_filter_catalogue is
  'Read-only filter source. Difficulty/workload match the displayed one-decimal averages, or NULL below three reviews. Respects caller permissions and underlying RLS.';

revoke all on public.course_filter_catalogue
from public, anon, authenticated, service_role;
grant select on public.course_filter_catalogue to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
