
-- SP3-16: Event editing, cancellation, and stale-write protection.

begin;

-- Every event has a revision number.
-- The revision increases whenever the event changes.
alter table public.events
add column revision integer not null default 1;

alter table public.events
add constraint events_revision_valid
check (revision >= 1);

-- Enforce editing rules inside the database.
create or replace function public.enforce_event_management()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Ownership cannot be transferred.
  if new.organizer_id is distinct from old.organizer_id then
    raise exception 'Event organizer cannot be changed';
  end if;

  -- Cancelled events are final.
  if old.status = 'cancelled' then
    raise exception 'Cancelled events cannot be modified';
  end if;

  -- A published event cannot become a draft again.
  if old.status = 'published' and new.status = 'draft' then
    raise exception 'Published events cannot return to draft';
  end if;

  -- Clients cannot choose their own revision number.
  if new.revision is distinct from old.revision then
    raise exception 'Event revision cannot be changed manually';
  end if;

  -- Database-managed optimistic concurrency version.
  new.revision := old.revision + 1;

  return new;
end;
$$;

revoke all on function public.enforce_event_management()
from public, anon, authenticated;

drop trigger if exists enforce_event_management
on public.events;

create trigger enforce_event_management
before update on public.events
for each row
execute function public.enforce_event_management();

-- Only the organizer may update their event.
-- This also applies to administrator accounts:
-- administrators can edit events they personally organized.
drop policy if exists
"Organizers and administrators can update events"
on public.events;

drop policy if exists
"Only event organizers can update events"
on public.events;

create policy "Only event organizers can update events"
on public.events
for update
to authenticated
using (
  organizer_id = (select auth.uid())
  and (select public.can_manage_events())
  and status <> 'cancelled'
)
with check (
  organizer_id = (select auth.uid())
  and (select public.can_manage_events())
);

commit;
