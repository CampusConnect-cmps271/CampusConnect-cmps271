
-- SP3-25 / SCRUM-209
-- Private saved events and reminder schedules.
-- Independent of the clubs module.

begin;

create table public.saved_events (
  student_id uuid not null
    references auth.users(id) on delete cascade,

  event_id uuid not null
    references public.events(id) on delete cascade,

  reminder_enabled boolean not null default true,

  reminder_minutes_before integer not null default 60
    check (reminder_minutes_before between 0 and 10080),

  created_at timestamptz not null default now(),

  primary key (student_id, event_id)
);

create index saved_events_event_idx
  on public.saved_events(event_id);

create table public.event_reminder_jobs (
  student_id uuid not null,

  event_id uuid not null,

  remind_at timestamptz not null,

  event_starts_at timestamptz not null,

  delivery_state text not null default 'pending'
    check (
      delivery_state in (
        'pending',
        'delivered',
        'suppressed'
      )
    ),

  delivered_at timestamptz,

  updated_at timestamptz not null default now(),

  primary key (student_id, event_id),

  foreign key (student_id, event_id)
    references public.saved_events(student_id, event_id)
    on delete cascade,

  constraint reminder_delivery_state_valid
    check (
      (
        delivery_state = 'delivered'
        and delivered_at is not null
      )
      or
      (
        delivery_state <> 'delivered'
        and delivered_at is null
      )
    )
);

create index event_reminder_pending_idx
  on public.event_reminder_jobs(remind_at, event_id)
  where delivery_state = 'pending';

-- Only allow students to save currently published,
-- upcoming events. Ownership is tied to auth.uid().

create function public.validate_saved_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record record;
begin
  if new.student_id is distinct from auth.uid() then
    raise exception 'Cannot save for another student'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.student_id is distinct from old.student_id
       or new.event_id is distinct from old.event_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Saved event ownership cannot change'
        using errcode = '42501';
    end if;
  end if;

  select e.status, e.ends_at
    into event_record
  from public.events e
  where e.id = new.event_id;

  if not found then
    raise exception 'Event not found'
      using errcode = '23503';
  end if;

  -- Existing saved events may be updated to turn reminders
  -- off after the event has been cancelled or finished.
  if tg_op = 'INSERT' then
    if event_record.status <> 'published'
       or event_record.ends_at <= now() then
      raise exception 'Only upcoming published events can be saved'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_saved_event()
  from public, anon, authenticated;

create trigger validate_saved_event
before insert or update on public.saved_events
for each row
execute function public.validate_saved_event();

-- Compute reminder times from the current event start time.
-- Students cannot directly create or edit reminder jobs.

create function public.sync_event_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record record;
  due_time timestamptz;
  new_state text;
begin
  select
    e.starts_at,
    e.ends_at,
    e.status
    into event_record
  from public.events e
  where e.id = new.event_id;

  if not found then
    return new;
  end if;

  due_time :=
    event_record.starts_at
    - make_interval(mins => new.reminder_minutes_before);

  if new.reminder_enabled
     and event_record.status = 'published'
     and event_record.ends_at > now()
     and due_time > now() then
    new_state := 'pending';
  else
    new_state := 'suppressed';
  end if;

  insert into public.event_reminder_jobs (
    student_id,
    event_id,
    remind_at,
    event_starts_at,
    delivery_state,
    delivered_at
  )
  values (
    new.student_id,
    new.event_id,
    due_time,
    event_record.starts_at,
    new_state,
    null
  )
  on conflict (student_id, event_id)
  do update set
    remind_at = excluded.remind_at,
    event_starts_at = excluded.event_starts_at,

    -- Do not resend a reminder that has already
    -- been delivered for an unchanged schedule.
    delivery_state = case
      when public.event_reminder_jobs.delivery_state = 'delivered'
       and public.event_reminder_jobs.remind_at = excluded.remind_at
       and new_state = 'pending'
      then 'delivered'
      else new_state
    end,

    delivered_at = case
      when public.event_reminder_jobs.delivery_state = 'delivered'
       and public.event_reminder_jobs.remind_at = excluded.remind_at
       and new_state = 'pending'
      then public.event_reminder_jobs.delivered_at
      else null
    end,

    updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_event_reminder()
  from public, anon, authenticated;

create trigger sync_saved_event_reminder
after insert or update of
  reminder_enabled,
  reminder_minutes_before
on public.saved_events
for each row
execute function public.sync_event_reminder();

-- Keep schedules aligned with changes to event times
-- or publication status, without changing saved events.

create function public.sync_reminders_after_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_record record;
  due_time timestamptz;
  new_state text;
begin
  if new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at
     and new.status is not distinct from old.status then
    return new;
  end if;

  for saved_record in
    select
      s.student_id,
      s.event_id,
      s.reminder_enabled,
      s.reminder_minutes_before
    from public.saved_events s
    where s.event_id = new.id
  loop

    due_time :=
      new.starts_at
      - make_interval(
          mins => saved_record.reminder_minutes_before
        );

    if saved_record.reminder_enabled
       and new.status = 'published'
       and new.ends_at > now()
       and due_time > now() then
      new_state := 'pending';
    else
      new_state := 'suppressed';
    end if;

    update public.event_reminder_jobs j
    set
      remind_at = due_time,
      event_starts_at = new.starts_at,

      delivery_state = case
        when j.delivery_state = 'delivered'
         and j.remind_at = due_time
         and new_state = 'pending'
        then 'delivered'
        else new_state
      end,

      delivered_at = case
        when j.delivery_state = 'delivered'
         and j.remind_at = due_time
         and new_state = 'pending'
        then j.delivered_at
        else null
      end,

      updated_at = now()
    where j.student_id = saved_record.student_id
      and j.event_id = saved_record.event_id;

  end loop;

  return new;
end;
$$;

revoke all on function public.sync_reminders_after_event_change()
  from public, anon, authenticated;

create trigger sync_reminders_after_event_change
after update of starts_at, ends_at, status
on public.events
for each row
execute function public.sync_reminders_after_event_change();

-- Privacy and permissions

alter table public.saved_events
enable row level security;

alter table public.event_reminder_jobs
enable row level security;

revoke all on public.saved_events
from public, anon, authenticated;

revoke all on public.event_reminder_jobs
from public, anon, authenticated;

grant select, delete
on public.saved_events to authenticated;

grant insert (
  student_id,
  event_id,
  reminder_enabled,
  reminder_minutes_before
)
on public.saved_events to authenticated;

grant update (
  reminder_enabled,
  reminder_minutes_before
)
on public.saved_events to authenticated;

-- Students may inspect their own schedules,
-- but cannot change delivery state.
grant select
on public.event_reminder_jobs to authenticated;

grant all
on public.saved_events to service_role;

grant all
on public.event_reminder_jobs to service_role;

create policy "Students view their own saved events"
on public.saved_events
for select to authenticated
using (student_id = (select auth.uid()));

create policy "Students save their own events"
on public.saved_events
for insert to authenticated
with check (student_id = (select auth.uid()));

create policy "Students change their own reminder preferences"
on public.saved_events
for update to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

create policy "Students remove their own saved events"
on public.saved_events
for delete to authenticated
using (student_id = (select auth.uid()));

create policy "Students view their own event reminders"
on public.event_reminder_jobs
for select to authenticated
using (student_id = (select auth.uid()));

-- Future notification delivery (SP3-26) will use
-- trusted server-side access to pending jobs.
-- Do not grant direct client write permissions to jobs.

notify pgrst, 'reload schema';

commit;
