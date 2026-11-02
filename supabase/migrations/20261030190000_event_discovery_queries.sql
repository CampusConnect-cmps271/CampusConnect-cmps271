
-- SP3-19 / SCRUM-203
-- Published event discovery with filtering and pagination.

begin;

create index if not exists events_discovery_idx
on public.events (
  starts_at,
  id
)
where status = 'published';

create index if not exists events_discovery_category_idx
on public.events (
  category,
  starts_at,
  id
)
where status = 'published';

create or replace function public.list_published_events(
  p_category text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_limit integer default 21,
  p_offset integer default 0,
  p_include_past boolean default false
)
returns table (
  id uuid,
  organizer_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  location text,
  category text,
  status text,
  registration_url text,
  club_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 51 then
    raise exception 'Limit must be between 1 and 51'
      using errcode = '22023';
  end if;

  if p_offset is null
     or p_offset < 0
     or p_offset > 1000 then
    raise exception 'Offset must be between 0 and 1000'
      using errcode = '22023';
  end if;

  if p_include_past is null then
    raise exception 'Invalid past-event filter'
      using errcode = '22023';
  end if;

  if p_category is not null and (
    char_length(btrim(p_category)) = 0
    or char_length(p_category) > 100
  ) then
    raise exception 'Invalid category'
      using errcode = '22023';
  end if;

  if p_start_date is not null
     and p_end_date is not null
     and p_end_date < p_start_date then
    raise exception 'End date cannot precede start date'
      using errcode = '22023';
  end if;

  return query
  select
    e.id,
    e.organizer_id,
    e.title,
    e.description,
    e.starts_at,
    e.ends_at,
    e.timezone,
    e.location,
    e.category,
    e.status,
    e.registration_url,
    e.club_name
  from public.events e
  where
    e.status = 'published'

    -- Past events are hidden by default.
    -- An event is past only when it has finished.
    and (
      p_include_past
      or e.ends_at > now()
    )

    -- Category filter is optional.
    and (
      p_category is null
      or e.category = btrim(p_category)
    )

    -- Calendar dates are interpreted in Beirut time.
    and (
      p_start_date is null
      or (e.starts_at at time zone 'Asia/Beirut')::date
         >= p_start_date
    )

    and (
      p_end_date is null
      or (e.starts_at at time zone 'Asia/Beirut')::date
         <= p_end_date
    )

  -- Stable ordering, even when multiple events
  -- have exactly the same start timestamp.
  order by
    e.starts_at asc,
    e.id asc

  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_published_events(
  text, date, date, integer, integer, boolean
) from public, anon;

grant execute on function public.list_published_events(
  text, date, date, integer, integer, boolean
) to authenticated;

commit;
