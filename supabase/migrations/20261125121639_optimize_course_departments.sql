-- SCRUM-309: return the small department selector without transferring every course.
begin;

create function public.list_course_departments()
returns table (department text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct c.department from public.courses as c order by c.department;
$$;

revoke all on function public.list_course_departments() from public, anon;
grant execute on function public.list_course_departments() to authenticated, service_role;

commit;
