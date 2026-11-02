-- SP3-13 / SCRUM-197: independent event model and access policies.
begin;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Beirut',
  location text not null,
  category text not null,
  status text not null default 'draft',
  registration_url text,
  club_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_title_valid
    check (char_length(btrim(title)) between 1 and 200),

  constraint events_description_valid
    check (char_length(description) <= 10000),

  constraint events_location_valid
    check (char_length(btrim(location)) between 1 and 300),

  constraint events_category_valid
    check (char_length(btrim(category)) between 1 and 100),

  constraint events_club_name_valid
    check (
      club_name is null
      or char_length(btrim(club_name)) between 1 and 150
    ),

  constraint events_time_order_valid
    check (ends_at > starts_at),

  constraint events_timezone_valid
    check (timezone = 'Asia/Beirut'),

  constraint events_status_valid
    check (status in ('draft', 'published', 'cancelled')),

  constraint events_registration_url_valid
    check (
      registration_url is null
      or (
        char_length(registration_url) <= 2048
        and registration_url ~* '^https://[^[:space:]]+$'
      )
    )
);

create index events_published_start_idx
on public.events (starts_at, id)
where status = 'published';

create index events_organizer_idx
on public.events (organizer_id, created_at desc);

-- Permission check using the existing user_roles table.
create or replace function public.can_manage_events()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role in ('club_representative', 'administrator')
  );
$$;

revoke all on function public.can_manage_events()
from public, anon;

grant execute on function public.can_manage_events()
to authenticated;

-- Automatically update the modification timestamp.
create or replace function public.set_event_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_event_updated_at()
from public, anon, authenticated;

create trigger set_event_updated_at
before update on public.events
for each row
execute function public.set_event_updated_at();

-- Enable Row Level Security.
alter table public.events enable row level security;

revoke all on public.events from anon, authenticated;

grant select on public.events to authenticated;

grant insert (
  organizer_id,
  title,
  description,
  starts_at,
  ends_at,
  timezone,
  location,
  category,
  status,
  registration_url,
  club_name
)
on public.events to authenticated;

grant update (
  title,
  description,
  starts_at,
  ends_at,
  timezone,
  location,
  category,
  status,
  registration_url,
  club_name
)
on public.events to authenticated;

grant select, insert, update, delete
on public.events to service_role;

-- Published events are visible to signed-in users.
-- Organizers can also see their own drafts and cancelled events.
-- Administrators can see all events.
create policy "Signed-in users can see published events and their own drafts"
on public.events
for select
to authenticated
using (
  status = 'published'
  or organizer_id = (select auth.uid())
  or (select public.current_user_role()) = 'administrator'
);

-- Only authorized users can create events for themselves.
create policy "Event managers can create their own events"
on public.events
for insert
to authenticated
with check (
  organizer_id = (select auth.uid())
  and (select public.can_manage_events())
  and status in ('draft', 'published')
);

-- Organizers and administrators can modify events.
create policy "Organizers and administrators can update events"
on public.events
for update
to authenticated
using (
  (select public.can_manage_events())
  and (
    organizer_id = (select auth.uid())
    or (select public.current_user_role()) = 'administrator'
  )
)
with check (
  (select public.can_manage_events())
  and (
    organizer_id = (select auth.uid())
    or (select public.current_user_role()) = 'administrator'
  )
);

-- Events cannot be deleted by regular users.
-- Cancellation will use status = 'cancelled'.

commit;