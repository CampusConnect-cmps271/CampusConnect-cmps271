-- Planner calendar: the student's own dated items (an exam, a meeting,
-- anything) in a semester plan, and a private "going" mark on saved events.
-- Everything here is typed or chosen by the student; none of it is AUB data.
-- Depends on 20261031140841_planner_semester_plans.sql and on
-- public.saved_events (20261030210000_saved_events_reminders.sql).
begin;

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null
    references public.semester_plans(id) on delete cascade,
  -- Optional: the planned course it belongs to, e.g. a midterm. Removing
  -- the course from the plan keeps the item.
  plan_course_id uuid
    references public.plan_courses(id) on delete set null,
  title text not null,
  -- A calendar date in Beirut, within 30 days either side of the plan's
  -- classes (checked by planner_check_item).
  on_date date not null,
  -- Minutes after Beirut midnight; both null for an all-day item.
  start_minute integer check (start_minute between 0 and 1439),
  end_minute integer check (end_minute between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plan_items_title_valid check (
    char_length(btrim(title)) between 1 and 120
  ),
  constraint plan_items_times_valid check (
    (start_minute is null and end_minute is null)
    or (start_minute is not null and end_minute is not null and end_minute > start_minute)
  )
);

create index plan_items_plan_idx on public.plan_items (plan_id, on_date);
create index plan_items_course_idx on public.plan_items (plan_course_id);

-- A saved event the student marks as going. Keyed to their saved_events
-- row, so going needs the event saved and unsaving removes the mark.
create table public.going_events (
  student_id uuid not null default auth.uid(),
  event_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (student_id, event_id),
  foreign key (student_id, event_id)
    references public.saved_events(student_id, event_id) on delete cascade
);

comment on table public.plan_items is
  'Dated items a student adds to a semester plan''s calendar. Typed by the student, not AUB data.';
comment on table public.going_events is
  'Saved events a student marks as going; they appear on the student''s planner calendar.';

-- Runs as the caller, so it only sees the student's own plan and courses.
create function public.planner_check_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  plan_record record;
begin
  select p.starts_on, p.ends_on
    into plan_record
  from public.semester_plans p
  where p.id = new.plan_id;

  if not found then
    -- An update with no plan is the plan's own delete cascading through
    -- plan_course_id's "on delete set null": nothing to check.
    if tg_op = 'UPDATE' then
      return new;
    end if;
    raise exception 'Semester plan not found'
      using errcode = '42501';
  end if;

  if new.on_date < plan_record.starts_on - 30
     or new.on_date > plan_record.ends_on + 30 then
    raise exception 'An item must fall within 30 days of the plan''s classes'
      using errcode = '23514';
  end if;

  if new.plan_course_id is not null and not exists (
    select 1 from public.plan_courses pc
    where pc.id = new.plan_course_id
      and pc.plan_id = new.plan_id
  ) then
    raise exception 'That course is not in this plan'
      using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(
      hashtextextended('planner.plan:' || new.plan_id::text, 0)
    );

    if (
      select count(*) from public.plan_items i
      where i.plan_id = new.plan_id
    ) >= 100 then
      raise exception 'A semester plan can hold at most 100 items'
        using errcode = '54000';
    end if;
  else
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create trigger plan_items_check
before insert or update on public.plan_items
for each row execute function public.planner_check_item();

-- Row-level security: a student sees and changes only their own rows.

alter table public.plan_items enable row level security;
alter table public.going_events enable row level security;

create policy "Students read items in their own plans"
on public.plan_items for select to authenticated
using (exists (
  select 1 from public.semester_plans p
  where p.id = plan_items.plan_id
    and p.student_id = (select auth.uid())
));

create policy "Students add items to their own plans"
on public.plan_items for insert to authenticated
with check (exists (
  select 1 from public.semester_plans p
  where p.id = plan_items.plan_id
    and p.student_id = (select auth.uid())
));

create policy "Students edit items in their own plans"
on public.plan_items for update to authenticated
using (exists (
  select 1 from public.semester_plans p
  where p.id = plan_items.plan_id
    and p.student_id = (select auth.uid())
))
with check (exists (
  select 1 from public.semester_plans p
  where p.id = plan_items.plan_id
    and p.student_id = (select auth.uid())
));

create policy "Students remove items from their own plans"
on public.plan_items for delete to authenticated
using (exists (
  select 1 from public.semester_plans p
  where p.id = plan_items.plan_id
    and p.student_id = (select auth.uid())
));

create policy "Students read their own going marks"
on public.going_events for select to authenticated
using (student_id = (select auth.uid()));

create policy "Students mark their own saved events as going"
on public.going_events for insert to authenticated
with check (student_id = (select auth.uid()));

create policy "Students remove their own going marks"
on public.going_events for delete to authenticated
using (student_id = (select auth.uid()));

-- Grants. Revoke Supabase's broad defaults first. Signed-in students only.
-- Column grants keep plan_id and student_id fixed, so an item never moves
-- between plans and a mark never moves between students.

revoke all on public.plan_items, public.going_events
  from public, anon, authenticated, service_role;

grant select, delete on public.plan_items to authenticated;
grant insert (plan_id, plan_course_id, title, on_date, start_minute, end_minute)
  on public.plan_items to authenticated;
grant update (plan_course_id, title, on_date, start_minute, end_minute)
  on public.plan_items to authenticated;

grant select, delete on public.going_events to authenticated;
grant insert (event_id) on public.going_events to authenticated;

revoke all on function public.planner_check_item()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
