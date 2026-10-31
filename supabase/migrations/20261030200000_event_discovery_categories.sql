
-- SP3-20 / SCRUM-204
-- Categories available from published events.
-- No dependency on the clubs module.

begin;

create or replace function public.list_published_event_categories()
returns table (
  category text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct e.category
  from public.events e
  where e.status = 'published'
    and (select auth.uid()) is not null
  order by e.category;
$$;

revoke all on function public.list_published_event_categories()
from public, anon;

grant execute on function public.list_published_event_categories()
to authenticated;

commit;
