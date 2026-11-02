begin;

create or replace function public.protect_event_organizer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organizer_id is distinct from old.organizer_id then
    raise exception 'Event organizer cannot be changed'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_event_organizer()
from public, anon, authenticated;

drop trigger if exists protect_event_organizer on public.events;

create trigger protect_event_organizer
before update on public.events
for each row
execute function public.protect_event_organizer();

commit;
