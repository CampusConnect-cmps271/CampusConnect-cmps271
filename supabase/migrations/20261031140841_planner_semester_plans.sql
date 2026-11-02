-- SCRUM-228 / SP3-44: private semester plans and the manual meeting contract.
-- A tentative organizer, not an AUB registration or timetable integration.
-- The app fills each plan's dates from the official AUB academic calendar;
-- every meeting time is typed by the student and stays tentative.
-- Depends only on public.courses (20261017091812_create_courses.sql).
begin;

create table public.semester_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  -- A season and year, e.g. 'Spring 2027'.
  term text not null,
  -- First and last day of classes; the conflict engine (SCRUM-67) uses them
  -- to place Beirut's daylight-saving changes.
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint semester_plans_term_valid check (
    term ~ '^(Fall|Spring|Summer) 20(2[5-9]|3[0-5])$'
  ),
  constraint semester_plans_dates_valid check (
    ends_on > starts_on and ends_on - starts_on <= 200
  ),
  constraint semester_plans_one_per_term unique (student_id, term)
);

create table public.plan_courses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null
    references public.semester_plans(id) on delete cascade,
  -- Credits are read live from the catalogue, never copied here.
  course_id uuid not null
    references public.courses(id) on delete restrict,
  -- Set by planner_prepare_plan_course and reorder_plan_courses.
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),

  constraint plan_courses_course_once unique (plan_id, course_id),
  -- Deferrable so reorder_plan_courses can swap positions in one statement.
  constraint plan_courses_position_once unique (plan_id, position)
    deferrable initially immediate
);

create index plan_courses_course_idx on public.plan_courses (course_id);

-- The manual Meeting contract: a weekly slot the student typed.
create table public.plan_meetings (
  id uuid primary key default gen_random_uuid(),
  plan_course_id uuid not null
    references public.plan_courses(id) on delete cascade,
  -- ISO weekday: 1 = Monday ... 7 = Sunday.
  weekday smallint not null check (weekday between 1 and 7),
  -- Minutes after local midnight; meetings never cross midnight.
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440),
  -- Any IANA zone (checked by planner_check_meeting); the app offers
  -- only Asia/Beirut for now.
  timezone text not null default 'Asia/Beirut',
  source text not null default 'manual' check (source = 'manual'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plan_meetings_times_valid check (end_minute > start_minute),
  constraint plan_meetings_timezone_length check (
    char_length(timezone) between 1 and 64
  ),
  constraint plan_meetings_once unique (
    plan_course_id, weekday, start_minute, end_minute, timezone
  )
);

comment on table public.semester_plans is
  'A student''s private, tentative semester plan. Dates come from the official AUB academic calendar.';
comment on table public.plan_courses is
  'Catalogue courses in a semester plan, in the student''s order. No prerequisite or degree checks.';
comment on table public.plan_meetings is
  'Weekly meeting times typed by the student (source = manual). Tentative, not AUB timetable data.';

-- Triggers. Each runs as the caller, so RLS limits what it can count, and
-- an advisory lock serializes concurrent writes to the same parent.

create function public.planner_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.planner_limit_plans()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('planner.student:' || new.student_id::text, 0)
  );

  if (
    select count(*) from public.semester_plans p
    where p.student_id = new.student_id
  ) >= 10 then
    raise exception 'A student can keep at most 10 semester plans'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

create function public.planner_prepare_plan_course()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  course_count integer;
  last_position integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('planner.plan:' || new.plan_id::text, 0)
  );

  select count(*), coalesce(max(pc.position), 0)
    into course_count, last_position
  from public.plan_courses pc
  where pc.plan_id = new.plan_id;

  if course_count >= 12 then
    raise exception 'A semester plan can hold at most 12 courses'
      using errcode = '54000';
  end if;

  new.position := last_position + 1;
  return new;
end;
$$;

create function public.planner_check_meeting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    if not exists (
      select 1 from pg_catalog.pg_timezone_names z
      where z.name = new.timezone
    ) then
      raise exception 'Unknown time zone'
        using errcode = '22023';
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(
      hashtextextended('planner.course:' || new.plan_course_id::text, 0)
    );

    if (
      select count(*) from public.plan_meetings m
      where m.plan_course_id = new.plan_course_id
    ) >= 7 then
      raise exception 'A planned course can have at most 7 meetings'
        using errcode = '54000';
    end if;
  else
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create trigger semester_plans_touch_updated_at
before update on public.semester_plans
for each row execute function public.planner_touch_updated_at();

create trigger semester_plans_limit
before insert on public.semester_plans
for each row execute function public.planner_limit_plans();

create trigger plan_courses_prepare
before insert on public.plan_courses
for each row execute function public.planner_prepare_plan_course();

create trigger plan_meetings_check
before insert or update on public.plan_meetings
for each row execute function public.planner_check_meeting();

-- Sets a plan's course order to course_ids, which must list exactly that
-- plan's courses. Runs as the caller: RLS hides other students' plans.
create function public.reorder_plan_courses(plan_id uuid, course_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_ids uuid[];
  requested_ids uuid[];
begin
  if not exists (
    select 1 from public.semester_plans p
    where p.id = reorder_plan_courses.plan_id
  ) then
    raise exception 'Semester plan not found'
      using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('planner.plan:' || reorder_plan_courses.plan_id::text, 0)
  );

  select coalesce(array_agg(pc.course_id order by pc.course_id), '{}')
    into current_ids
  from public.plan_courses pc
  where pc.plan_id = reorder_plan_courses.plan_id;

  select coalesce(array_agg(requested order by requested), '{}')
    into requested_ids
  from unnest(coalesce(reorder_plan_courses.course_ids, '{}')) as requested;

  if requested_ids is distinct from current_ids then
    raise exception 'The new order must list each course in the plan exactly once'
      using errcode = '22023';
  end if;

  update public.plan_courses pc
     set position = ordered.ordinality
    from unnest(reorder_plan_courses.course_ids)
         with ordinality as ordered(course_id, ordinality)
   where pc.plan_id = reorder_plan_courses.plan_id
     and pc.course_id = ordered.course_id;
end;
$$;

-- Row-level security: a student sees and changes only their own plans.

alter table public.semester_plans enable row level security;
alter table public.plan_courses enable row level security;
alter table public.plan_meetings enable row level security;

create policy "Students read their own semester plans"
on public.semester_plans for select to authenticated
using (student_id = (select auth.uid()));

create policy "Students create their own semester plans"
on public.semester_plans for insert to authenticated
with check (student_id = (select auth.uid()));

create policy "Students delete their own semester plans"
on public.semester_plans for delete to authenticated
using (student_id = (select auth.uid()));

create policy "Students read courses in their own plans"
on public.plan_courses for select to authenticated
using (exists (
  select 1 from public.semester_plans p
  where p.id = plan_courses.plan_id
    and p.student_id = (select auth.uid())
));

create policy "Students add courses to their own plans"
on public.plan_courses for insert to authenticated
with check (exists (
  select 1 from public.semester_plans p
  where p.id = plan_courses.plan_id
    and p.student_id = (select auth.uid())
));

create policy "Students reorder courses in their own plans"
on public.plan_courses for update to authenticated
using (exists (
  select 1 from public.semester_plans p
  where p.id = plan_courses.plan_id
    and p.student_id = (select auth.uid())
))
with check (exists (
  select 1 from public.semester_plans p
  where p.id = plan_courses.plan_id
    and p.student_id = (select auth.uid())
));

create policy "Students remove courses from their own plans"
on public.plan_courses for delete to authenticated
using (exists (
  select 1 from public.semester_plans p
  where p.id = plan_courses.plan_id
    and p.student_id = (select auth.uid())
));

create policy "Students read meetings in their own plans"
on public.plan_meetings for select to authenticated
using (exists (
  select 1
  from public.plan_courses pc
  join public.semester_plans p on p.id = pc.plan_id
  where pc.id = plan_meetings.plan_course_id
    and p.student_id = (select auth.uid())
));

create policy "Students add meetings in their own plans"
on public.plan_meetings for insert to authenticated
with check (exists (
  select 1
  from public.plan_courses pc
  join public.semester_plans p on p.id = pc.plan_id
  where pc.id = plan_meetings.plan_course_id
    and p.student_id = (select auth.uid())
));

create policy "Students edit meetings in their own plans"
on public.plan_meetings for update to authenticated
using (exists (
  select 1
  from public.plan_courses pc
  join public.semester_plans p on p.id = pc.plan_id
  where pc.id = plan_meetings.plan_course_id
    and p.student_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.plan_courses pc
  join public.semester_plans p on p.id = pc.plan_id
  where pc.id = plan_meetings.plan_course_id
    and p.student_id = (select auth.uid())
));

create policy "Students remove meetings in their own plans"
on public.plan_meetings for delete to authenticated
using (exists (
  select 1
  from public.plan_courses pc
  join public.semester_plans p on p.id = pc.plan_id
  where pc.id = plan_meetings.plan_course_id
    and p.student_id = (select auth.uid())
));

-- Grants. Supabase grants new tables and functions broadly by default, so
-- revoke everything first. Signed-in students only; nothing for anon.
-- Column grants keep student_id, plan_id, plan_course_id and course_id
-- fixed, so a row never moves between students or plans, and keep the
-- official term dates out of students' hands.

revoke all on public.semester_plans, public.plan_courses, public.plan_meetings
  from public, anon, authenticated, service_role;

grant select, delete on public.semester_plans to authenticated;
grant insert (term, starts_on, ends_on) on public.semester_plans to authenticated;

grant select, delete on public.plan_courses to authenticated;
grant insert (plan_id, course_id) on public.plan_courses to authenticated;
grant update (position) on public.plan_courses to authenticated;

grant select, delete on public.plan_meetings to authenticated;
grant insert (plan_course_id, weekday, start_minute, end_minute, timezone, source)
  on public.plan_meetings to authenticated;
grant update (weekday, start_minute, end_minute, timezone)
  on public.plan_meetings to authenticated;

revoke all on function public.planner_touch_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.planner_limit_plans()
  from public, anon, authenticated, service_role;
revoke all on function public.planner_prepare_plan_course()
  from public, anon, authenticated, service_role;
revoke all on function public.planner_check_meeting()
  from public, anon, authenticated, service_role;

revoke all on function public.reorder_plan_courses(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.reorder_plan_courses(uuid, uuid[])
  to authenticated;

notify pgrst, 'reload schema';
commit;
