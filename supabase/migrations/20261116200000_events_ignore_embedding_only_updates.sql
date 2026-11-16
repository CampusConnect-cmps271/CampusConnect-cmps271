-- SCRUM-254 follow-up: filling in an event's embedding is bookkeeping, not an
-- edit. It used to raise `revision` and `updated_at` like any update, so an
-- organizer with the edit form open while `npm run embed:campus-content` ran got
-- a stale-write conflict on save. An update that changes only `embedding` now
-- leaves both alone. Every other update behaves exactly as before.
begin;

create or replace function public.enforce_event_management()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The backfill only sets the embedding: not a user edit, so no new revision.
  if (pg_catalog.to_jsonb(new) -> 'embedding') is distinct from (pg_catalog.to_jsonb(old) -> 'embedding')
     and (pg_catalog.to_jsonb(new) - 'embedding') = (pg_catalog.to_jsonb(old) - 'embedding') then
    return new;
  end if;

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

create or replace function public.set_event_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (pg_catalog.to_jsonb(new) -> 'embedding') is distinct from (pg_catalog.to_jsonb(old) -> 'embedding')
     and (pg_catalog.to_jsonb(new) - 'embedding') = (pg_catalog.to_jsonb(old) - 'embedding') then
    return new;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

commit;
