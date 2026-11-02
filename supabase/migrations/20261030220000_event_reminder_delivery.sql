
-- SP3-26 / SCRUM-210
-- Idempotent event reminder delivery.
-- Additive extension to existing notifications.

begin;

-- Add event references without changing existing
-- message, comment, or moderation notification columns.

alter table public.notifications
add column event_id uuid
references public.events(id) on delete cascade;

alter table public.notifications
add column event_remind_at timestamptz;

-- Preserve all existing notification types.
-- Add one new type for event reminders.

alter table public.notifications
drop constraint notifications_type_check;

alter table public.notifications
add constraint notifications_type_check
check (
  type in (
    'message',
    'post_comment',
    'comment_reply',
    'content_removed',
    'event_reminder'
  )
);

-- Each reminder must belong to an event, and
-- each non-reminder must not use reminder-specific data.

alter table public.notifications
drop constraint notifications_links_check;

alter table public.notifications
add constraint notifications_links_check
check (
  case type
    when 'message' then
      actor_id is not null
      and conversation_id is not null

    when 'post_comment' then
      actor_id is not null
      and post_id is not null
      and comment_id is not null

    when 'comment_reply' then
      actor_id is not null
      and post_id is not null
      and comment_id is not null

    when 'content_removed' then
      post_id is not null
      or comment_id is not null

    when 'event_reminder' then
      event_id is not null
      and event_remind_at is not null
      and actor_id is null
      and conversation_id is null
      and post_id is null
      and comment_id is null

    else false
  end
);

create index notifications_event_id_idx
on public.notifications(event_id);

-- This database constraint is the final protection
-- against duplicate reminders, even if a worker
-- retries after a network failure.

create unique index notifications_event_reminder_unique_idx
on public.notifications (
  recipient_id,
  event_id,
  event_remind_at
)
where type = 'event_reminder';

-- Existing notification permissions and RLS policies
-- remain unchanged.
--
-- Students can read only their own notifications.
-- Ordinary clients cannot insert notifications.

-- A trusted delivery function claims due jobs using
-- row locks, checks the saved event and event status,
-- and inserts the notification in one transaction.

create or replace function public.deliver_due_event_reminders(
  p_batch_size integer default 50
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder record;
  delivered_count integer := 0;
  inserted_count integer;
begin
  if p_batch_size is null
     or p_batch_size < 1
     or p_batch_size > 100 then
    raise exception 'Invalid reminder batch size'
      using errcode = '22023';
  end if;

  for reminder in
    select
      j.student_id,
      j.event_id,
      j.remind_at,
      j.event_starts_at,
      s.reminder_enabled,
      s.reminder_minutes_before,
      e.starts_at,
      e.ends_at,
      e.status
    from public.event_reminder_jobs j
    left join public.saved_events s
      on s.student_id = j.student_id
     and s.event_id = j.event_id
    left join public.events e
      on e.id = j.event_id
    where j.delivery_state = 'pending'
      and j.remind_at <= now()
    order by j.remind_at, j.event_id, j.student_id
    limit p_batch_size
    for update of j skip locked
  loop

    -- Never send for an unsaved, disabled,
    -- cancelled, or already ended event.
    --
    -- Also verify that the reminder is based
    -- on the event's current start timestamp.

    if reminder.reminder_enabled is distinct from true
       or reminder.status is distinct from 'published'
       or reminder.ends_at is null
       or reminder.ends_at <= now()
       or reminder.starts_at is distinct from
          reminder.event_starts_at
       or reminder.remind_at is distinct from (
         reminder.starts_at -
         make_interval(
           mins => reminder.reminder_minutes_before
         )
       )
    then
      update public.event_reminder_jobs
      set
        delivery_state = 'suppressed',
        delivered_at = null,
        updated_at = now()
      where student_id = reminder.student_id
        and event_id = reminder.event_id
        and delivery_state = 'pending';

      continue;
    end if;

    -- PostgreSQL's unique index makes insertion
    -- idempotent across retries and concurrent runs.

    insert into public.notifications (
      recipient_id,
      type,
      event_id,
      event_remind_at
    )
    values (
      reminder.student_id,
      'event_reminder',
      reminder.event_id,
      reminder.remind_at
    )
    on conflict (
      recipient_id,
      event_id,
      event_remind_at
    )
    where type = 'event_reminder'
    do nothing;

    get diagnostics inserted_count = row_count;

    -- Mark this exact scheduled reminder delivered.
    -- The notification and delivery state are saved
    -- atomically in the same database transaction.

    update public.event_reminder_jobs
    set
      delivery_state = 'delivered',
      delivered_at = now(),
      updated_at = now()
    where student_id = reminder.student_id
      and event_id = reminder.event_id
      and delivery_state = 'pending'
      and remind_at = reminder.remind_at;

    delivered_count := delivered_count + inserted_count;
  end loop;

  return delivered_count;
end;
$$;

-- Do not expose the delivery worker as a client RPC.

revoke all on function
  public.deliver_due_event_reminders(integer)
from public, anon, authenticated;

grant execute on function
  public.deliver_due_event_reminders(integer)
to service_role;

-- Schedule the delivery worker once per minute on
-- hosted databases that have pg_cron installed.
--
-- Isolated PGlite tests do not require pg_cron.

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pg_cron'
  ) then
    perform cron.schedule(
      'deliver-campus-event-reminders',
      '* * * * *',
      'select public.deliver_due_event_reminders(50)'
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
