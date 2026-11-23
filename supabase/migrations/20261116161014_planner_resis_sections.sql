-- SCRUM-243 / SP4-01: class times from AUB's imported schedule.
--
-- A plan links to an imported Resis semester. A planned course then takes its
-- times from the sections (CRNs) the student chooses in that semester's active
-- snapshot. Only planner_choose_sections writes those section links and their
-- meeting rows, deriving the times from the snapshot itself, so a client can
-- never send its own "AUB" times. Typed (manual) meetings work as before.
--
-- Keeps plan_meetings' columns and their meaning (weekday, start_minute,
-- end_minute, timezone), which the campus assistant reads; adds crn and a
-- second source, 'resis'.
--
-- Depends on 20261031140841_planner_semester_plans.sql and
-- 20261108193027_resis_semester_catalogue.sql.
begin;

-- 1. A plan links to an imported semester -----------------------------------

alter table public.semester_plans
  add column resis_semester_id text references public.resis_semesters(id);

create index semester_plans_resis_semester_idx on public.semester_plans (resis_semester_id);

comment on column public.semester_plans.resis_semester_id is
  'The imported Resis semester whose sections fill in this plan''s class times, or null. Students may set it only to a semester with an active import.';

-- The one place a planner term is mapped to Resis's name for the same AUB
-- term: AUB's academic year runs Fall to Summer, so "Fall 2026" is
-- "Fall 2026-2027" and "Spring 2027" is "Spring 2026-2027". Mirrors
-- resisSemesterName in frontend/modules/planner/terms.ts.
create function public.planner_resis_semester_name(p_term text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case parts[1]
    when 'Fall' then 'Fall ' || parts[2] || '-' || (parts[2]::integer + 1)
    when 'Spring' then 'Spring ' || (parts[2]::integer - 1) || '-' || parts[2]
    when 'Summer' then 'Summer ' || (parts[2]::integer - 1) || '-' || parts[2]
  end
  from (select regexp_match(p_term, '^(Fall|Spring|Summer) (20[0-9]{2})$') as parts) as term
$$;

-- The imported semester a plan for p_term links to: the only one with an
-- active import and Resis's name for that term, else null.
create function public.planner_matching_resis_semester(p_term text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case when count(*) = 1 then min(s.id) end
  from public.resis_semesters s
  where s.name = public.planner_resis_semester_name(p_term)
    and s.active_import_id is not null
$$;

-- A new plan links itself when exactly one imported semester matches its term.
-- Runs as the caller, so RLS shows it only semesters with an active import.
create function public.planner_link_new_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.resis_semester_id is null then
    new.resis_semester_id := public.planner_matching_resis_semester(new.term);
  end if;
  return new;
end;
$$;

create trigger semester_plans_link_resis
before insert on public.semester_plans
for each row execute function public.planner_link_new_plan();

-- Existing plans link the same way.
update public.semester_plans p
   set resis_semester_id = public.planner_matching_resis_semester(p.term)
 where p.resis_semester_id is null
   and public.planner_matching_resis_semester(p.term) is not null;

-- Students had no update on their plans; now they may set or clear the link,
-- and nothing else (the column grant below).
create policy "Students link their own plans to an imported semester"
on public.semester_plans for update to authenticated
using (student_id = (select auth.uid()))
with check (
  student_id = (select auth.uid())
  and (
    resis_semester_id is null
    or exists (
      select 1 from public.resis_semesters s
      where s.id = semester_plans.resis_semester_id
        and s.active_import_id is not null
    )
  )
);

-- 2. Sections chosen for a planned course -----------------------------------

create table public.plan_course_sections (
  plan_course_id uuid not null
    references public.plan_courses(id) on delete cascade,
  crn text not null check (crn ~ '^[0-9]{1,10}$'),
  -- The section's number when it was chosen ("3", "L1"), so a section that
  -- later leaves the schedule can still be named.
  section text not null check (char_length(btrim(section)) between 1 and 40),
  semester_id text not null references public.resis_semesters(id),
  -- The import the times were taken from. Not a foreign key: old imports may
  -- be cleaned up, and this is a record of where the times came from.
  import_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (plan_course_id, crn)
);

create index plan_course_sections_semester_idx on public.plan_course_sections (semester_id);

comment on table public.plan_course_sections is
  'Sections (CRNs) of AUB''s imported schedule chosen for a planned course. Written only by planner_choose_sections.';

-- 3. Meetings: typed by the student, or taken from a chosen section ---------

alter table public.plan_meetings drop constraint plan_meetings_source_check;
alter table public.plan_meetings add column crn text;
alter table public.plan_meetings
  add constraint plan_meetings_source_valid check (source in ('manual', 'resis')),
  -- A typed meeting has no CRN. A section's meeting has its CRN and is in
  -- Beirut, where AUB's schedule is.
  add constraint plan_meetings_crn_valid check (
    (source = 'manual' and crn is null)
    or (source = 'resis' and crn ~ '^[0-9]{1,10}$' and timezone = 'Asia/Beirut')
  ),
  -- A section's meetings go when the section is unchosen.
  add constraint plan_meetings_section_fkey foreign key (plan_course_id, crn)
    references public.plan_course_sections (plan_course_id, crn) on delete cascade;

comment on table public.plan_meetings is
  'Weekly meeting times: typed by the student (source = manual, tentative), or one weekday of one session of a chosen AUB section (source = resis, with its CRN), written only by planner_choose_sections.';
comment on column public.plan_meetings.crn is
  'For source = resis, the CRN of the chosen section the time comes from; null for typed meetings.';

-- Students may still read and delete any meeting in their own plans, but may
-- only add or edit typed ones. Section times can't be forged or edited
-- through the API.
drop policy "Students add meetings in their own plans" on public.plan_meetings;
drop policy "Students edit meetings in their own plans" on public.plan_meetings;

create policy "Students add typed meetings in their own plans"
on public.plan_meetings for insert to authenticated
with check (
  source = 'manual'
  and exists (
    select 1
    from public.plan_courses pc
    join public.semester_plans p on p.id = pc.plan_id
    where pc.id = plan_meetings.plan_course_id
      and p.student_id = (select auth.uid())
  )
);

create policy "Students edit typed meetings in their own plans"
on public.plan_meetings for update to authenticated
using (
  source = 'manual'
  and exists (
    select 1
    from public.plan_courses pc
    join public.semester_plans p on p.id = pc.plan_id
    where pc.id = plan_meetings.plan_course_id
      and p.student_id = (select auth.uid())
  )
)
with check (
  source = 'manual'
  and exists (
    select 1
    from public.plan_courses pc
    join public.semester_plans p on p.id = pc.plan_id
    where pc.id = plan_meetings.plan_course_id
      and p.student_id = (select auth.uid())
  )
);

-- The meeting checks, now per source. A course uses typed times or sections,
-- not both: a typed meeting is refused while the course has sections. Typed
-- meetings stay capped at 7 a course. Section meetings get 14: the most one
-- choice needs in the imported data is 11 (UPEN 001 section 1, Fall 2026-2027).
create or replace function public.planner_check_meeting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cap integer;
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

    if new.source = 'manual' and exists (
      select 1 from public.plan_course_sections s
      where s.plan_course_id = new.plan_course_id
    ) then
      raise exception 'This course takes its times from AUB sections; use typed times instead before adding one'
        using errcode = '55000';
    end if;

    cap := case when new.source = 'resis' then 14 else 7 end;
    if (
      select count(*) from public.plan_meetings m
      where m.plan_course_id = new.plan_course_id
        and m.source = new.source
    ) >= cap then
      raise exception 'A planned course can have at most % meetings of this kind', cap
        using errcode = '54000';
    end if;
  else
    new.updated_at := now();
  end if;

  return new;
end;
$$;

-- 4. Reading times from the snapshot ---------------------------------------

-- The weekly rows one Resis session gives: one per weekday letter (M T W R F
-- S U, Monday to Sunday; spaces ignored) at its start and end times in
-- Beirut. A session whose days or times are blank, "TBA" or unreadable gives
-- none, so its course shows as unknown, never as clear. Mirrors
-- sessionMeetings in frontend/modules/planner/sections.ts.
create function public.planner_resis_session_rows(p_session jsonb)
returns table (weekday smallint, start_minute integer, end_minute integer)
language sql
immutable
set search_path = ''
as $$
  with parsed as (
    select
      regexp_replace(coalesce(p_session->>'days', ''), '\s', '', 'g') as days,
      regexp_match(coalesce(p_session->>'start', ''), '^\s*([01][0-9]|2[0-3]):([0-5][0-9])\s*$') as starts,
      regexp_match(coalesce(p_session->>'end', ''), '^\s*([01][0-9]|2[0-3]):([0-5][0-9])\s*$') as ends
  ), minutes as (
    select
      days,
      starts[1]::integer * 60 + starts[2]::integer as start_minute,
      ends[1]::integer * 60 + ends[2]::integer as end_minute
    from parsed
    where days ~ '^[MTWRFSU]+$' and starts is not null and ends is not null
  )
  select distinct
    strpos('MTWRFSU', letter)::smallint,
    m.start_minute,
    m.end_minute
  from minutes m
  cross join lateral regexp_split_to_table(m.days, '') as letter
  where m.end_minute > m.start_minute
$$;

-- The weekly rows of some sections in one import, one per weekday and time.
-- A row two of the sections share is kept once, under the lower CRN. Runs as
-- the caller: a student reads only active snapshots.
create function public.planner_section_rows(p_import_id uuid, p_crns text[])
returns table (crn text, weekday smallint, start_minute integer, end_minute integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select min(x.section->>'crn'), r.weekday, r.start_minute, r.end_minute
  from public.course_offerings o
  cross join lateral jsonb_array_elements(o.sections) as x(section)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(x.section->'sessions') = 'array' then x.section->'sessions' else '[]'::jsonb end
  ) as s(session)
  cross join lateral public.planner_resis_session_rows(s.session) as r
  where o.import_id = p_import_id
    and x.section->>'crn' = any(p_crns)
  group by r.weekday, r.start_minute, r.end_minute
$$;

-- 5. Choosing sections ------------------------------------------------------

-- Replaces a planned course's sections, and their meeting rows, with p_crns
-- from the active snapshot of the semester its plan links to. Every CRN must
-- be a section of the course in that snapshot, except that a CRN a chosen
-- section lists in connected_crns may be another course's section. The rows
-- come from the snapshot's own sessions. Choosing sections removes the
-- course's typed meetings. An empty array clears the sections. Returns the
-- number of meeting rows written.
--
-- Security definer because students may not write section links or section
-- meetings themselves; it checks with auth.uid() that the plan is theirs.
create function public.planner_choose_sections(p_plan_course_id uuid, p_crns text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  planned record;
  chosen text[];
  own text[];
  written integer;
begin
  select pc.id, pc.course_id, p.resis_semester_id, s.active_import_id
    into planned
  from public.plan_courses pc
  join public.semester_plans p on p.id = pc.plan_id
  left join public.resis_semesters s on s.id = p.resis_semester_id
  where pc.id = p_plan_course_id
    and p.student_id = (select auth.uid());

  if not found then
    raise exception 'That course is not in one of your plans'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('planner.course:' || p_plan_course_id::text, 0)
  );

  if exists (
    select 1 from unnest(coalesce(p_crns, '{}'::text[])) as c
    where c is null or c !~ '^[0-9]{1,10}$'
  ) then
    raise exception 'A CRN is a number of up to 10 digits'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct c order by c), '{}'::text[])
    into chosen
  from unnest(coalesce(p_crns, '{}'::text[])) as c;

  if cardinality(chosen) > 4 then
    raise exception 'Choose at most 4 sections for one course'
      using errcode = '54000';
  end if;

  if cardinality(chosen) = 0 then
    -- Their meetings go with them (plan_meetings_section_fkey).
    delete from public.plan_course_sections where plan_course_id = p_plan_course_id;
    return 0;
  end if;

  if planned.active_import_id is null then
    raise exception 'Link this plan to an imported semester first'
      using errcode = '55000';
  end if;

  select coalesce(array_agg(x.section->>'crn'), '{}'::text[])
    into own
  from public.course_offerings o
  cross join lateral jsonb_array_elements(o.sections) as x(section)
  where o.import_id = planned.active_import_id
    and o.course_id = planned.course_id
    and x.section->>'crn' = any(chosen);

  if cardinality(own) = 0 then
    raise exception 'Choose a section of this course in the imported schedule'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(chosen) as c
    where c <> all(own)
      and not (
        exists (
          select 1
          from public.course_offerings o
          cross join lateral jsonb_array_elements(o.sections) as x(section)
          where o.import_id = planned.active_import_id
            and o.course_id = planned.course_id
            and x.section->>'crn' = any(own)
            and jsonb_typeof(x.section->'connected_crns') = 'array'
            and x.section->'connected_crns' ? c
        )
        and exists (
          select 1
          from public.course_offerings o
          cross join lateral jsonb_array_elements(o.sections) as x(section)
          where o.import_id = planned.active_import_id
            and x.section->>'crn' = c
        )
      )
  ) then
    raise exception 'Each CRN must be a section of this course, or a section a chosen one is linked to'
      using errcode = '22023';
  end if;

  -- A course uses typed times or sections, not both.
  delete from public.plan_meetings where plan_course_id = p_plan_course_id;
  delete from public.plan_course_sections where plan_course_id = p_plan_course_id;

  insert into public.plan_course_sections (plan_course_id, crn, section, semester_id, import_id)
  select distinct on (x.section->>'crn')
    p_plan_course_id, x.section->>'crn', btrim(x.section->>'section'),
    planned.resis_semester_id, planned.active_import_id
  from public.course_offerings o
  cross join lateral jsonb_array_elements(o.sections) as x(section)
  where o.import_id = planned.active_import_id
    and x.section->>'crn' = any(chosen)
  order by x.section->>'crn';

  insert into public.plan_meetings
    (plan_course_id, weekday, start_minute, end_minute, timezone, source, crn)
  select p_plan_course_id, r.weekday, r.start_minute, r.end_minute, 'Asia/Beirut', 'resis', r.crn
  from public.planner_section_rows(planned.active_import_id, chosen) as r;

  get diagnostics written = row_count;
  return written;
end;
$$;

-- 6. When a newer snapshot is activated -------------------------------------

-- The chosen sections of one of the student's plans that AUB's schedule no
-- longer has at the same times: 'gone' when the linked semester's active
-- snapshot lacks the CRN, 'changed' when its times differ from the plan's.
-- Sections taken from the active snapshot itself are never reported. Nothing
-- is changed here; "Update times" calls planner_choose_sections.
create function public.planner_section_changes(p_plan_id uuid)
returns table (plan_course_id uuid, crn text, section text, status text, imported_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with plan as (
    select p.id, s.active_import_id, s.synced_at
    from public.semester_plans p
    join public.resis_semesters s on s.id = p.resis_semester_id
    where p.id = p_plan_id
      and p.student_id = (select auth.uid())
      and s.active_import_id is not null
  ), chosen as (
    select cs.plan_course_id, cs.crn, cs.section, cs.import_id
    from public.plan_course_sections cs
    join public.plan_courses pc on pc.id = cs.plan_course_id
    join plan on plan.id = pc.plan_id
  ), stale as (
    select c.plan_course_id, array_agg(c.crn) as crns
    from chosen c, plan
    group by c.plan_course_id
    having bool_or(c.import_id is distinct from plan.active_import_id)
  ), present as (
    select distinct x.section->>'crn' as crn
    from plan
    join public.course_offerings o on o.import_id = plan.active_import_id
    cross join lateral jsonb_array_elements(o.sections) as x(section)
    where x.section->>'crn' in (select unnest(stale.crns) from stale)
  ), expected as (
    select stale.plan_course_id, r.crn, r.weekday, r.start_minute, r.end_minute
    from stale
    cross join plan
    cross join lateral public.planner_section_rows(plan.active_import_id, stale.crns) as r
  ), stored as (
    select m.plan_course_id, m.crn, m.weekday, m.start_minute, m.end_minute
    from public.plan_meetings m
    join stale on stale.plan_course_id = m.plan_course_id
    where m.source = 'resis'
  )
  select c.plan_course_id, c.crn, c.section,
    case when c.crn in (select crn from present) then 'changed' else 'gone' end,
    plan.synced_at
  from chosen c
  join stale on stale.plan_course_id = c.plan_course_id
  cross join plan
  where c.crn not in (select crn from present)
     or exists (
       select e.weekday, e.start_minute, e.end_minute from expected e
       where e.plan_course_id = c.plan_course_id and e.crn = c.crn
       except
       select s.weekday, s.start_minute, s.end_minute from stored s
       where s.plan_course_id = c.plan_course_id and s.crn = c.crn
     )
     or exists (
       select s.weekday, s.start_minute, s.end_minute from stored s
       where s.plan_course_id = c.plan_course_id and s.crn = c.crn
       except
       select e.weekday, e.start_minute, e.end_minute from expected e
       where e.plan_course_id = c.plan_course_id and e.crn = c.crn
     )
  order by c.plan_course_id, c.crn
$$;

-- How many sections each of some courses has in a semester's active
-- snapshot, for the plan page's course search. Courses it doesn't offer
-- are left out.
create function public.planner_offered_sections(p_semester_id text, p_course_ids uuid[])
returns table (course_id uuid, section_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.course_id, jsonb_array_length(o.sections)
  from public.resis_semesters s
  join public.course_offerings o on o.import_id = s.active_import_id
  where s.id = p_semester_id
    and o.course_id = any(p_course_ids[1:50])
$$;

-- 7. Row-level security and grants -----------------------------------------

alter table public.plan_course_sections enable row level security;

create policy "Students read sections chosen in their own plans"
on public.plan_course_sections for select to authenticated
using (exists (
  select 1
  from public.plan_courses pc
  join public.semester_plans p on p.id = pc.plan_id
  where pc.id = plan_course_sections.plan_course_id
    and p.student_id = (select auth.uid())
));

-- Supabase grants new tables and functions broadly by default: revoke first.
revoke all on public.plan_course_sections from public, anon, authenticated, service_role;
grant select on public.plan_course_sections to authenticated;

-- The link is the only column of a plan a student may change. crn and source
-- stay out of plan_meetings' update grant; source stays in its insert grant,
-- where the insert policy allows only 'manual', and crn is never granted.
grant update (resis_semester_id) on public.semester_plans to authenticated;

revoke all on function public.planner_resis_semester_name(text) from public, anon, authenticated, service_role;
revoke all on function public.planner_matching_resis_semester(text) from public, anon, authenticated, service_role;
revoke all on function public.planner_link_new_plan() from public, anon, authenticated, service_role;
revoke all on function public.planner_resis_session_rows(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.planner_section_rows(uuid, text[]) from public, anon, authenticated, service_role;
revoke all on function public.planner_choose_sections(uuid, text[]) from public, anon, authenticated, service_role;
revoke all on function public.planner_section_changes(uuid) from public, anon, authenticated, service_role;
revoke all on function public.planner_offered_sections(text, uuid[]) from public, anon, authenticated, service_role;

-- The insert trigger and the RPCs below call these as the student.
grant execute on function public.planner_resis_semester_name(text) to authenticated;
grant execute on function public.planner_matching_resis_semester(text) to authenticated;
grant execute on function public.planner_resis_session_rows(jsonb) to authenticated;
grant execute on function public.planner_section_rows(uuid, text[]) to authenticated;

grant execute on function public.planner_choose_sections(uuid, text[]) to authenticated;
grant execute on function public.planner_section_changes(uuid) to authenticated;
grant execute on function public.planner_offered_sections(text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
