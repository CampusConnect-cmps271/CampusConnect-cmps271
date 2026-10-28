-- SCRUM-34 through SCRUM-37: club discovery, profiles, verification, and
-- announcements. Club administration is deliberately exposed through RPCs so
-- a client can never self-approve by choosing protected update columns.
begin;

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug = lower(trim(slug)) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  category text not null check (char_length(trim(category)) between 2 and 80),
  public_email text check (public_email is null or char_length(trim(public_email)) between 3 and 254),
  public_website text check (public_website is null or public_website ~ '^https://'),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  verification_reason text check (verification_reason is null or char_length(trim(verification_reason)) between 3 and 500),
  verification_requested_at timestamptz,
  verification_reviewed_at timestamptz,
  verification_reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_verification_review_pair check (
    (verification_status = 'pending' and verification_reviewed_at is null and verification_reviewed_by is null)
    or
    (verification_status in ('verified', 'rejected') and verification_reviewed_at is not null and verification_reviewed_by is not null)
  )
);

create index clubs_directory_idx on public.clubs (category, lower(name), id);
create index clubs_verification_queue_idx on public.clubs (verification_status, verification_requested_at, id);

create table public.club_memberships (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('member', 'representative')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index club_memberships_user_idx on public.club_memberships (user_id, role, club_id);

create table public.club_announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  title text not null check (char_length(trim(title)) between 3 and 160),
  body text not null check (char_length(trim(body)) between 10 and 5000),
  status text not null default 'draft' check (status in ('draft', 'published', 'removed')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_announcements_publish_pair check (
    (status = 'published' and published_at is not null)
    or (status in ('draft', 'removed'))
  )
);

create index club_announcements_public_idx
on public.club_announcements (club_id, published_at desc, id desc)
where status = 'published';

create or replace function public.is_club_manager(requested_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_user_role() = 'administrator'
    or exists (
      select 1
      from public.club_memberships m
      join public.clubs c on c.id = m.club_id
      where m.club_id = requested_club_id
        and m.user_id = (select auth.uid())
        and m.role = 'representative'
        and c.verification_status = 'verified'
    );
$$;

revoke all on function public.is_club_manager(uuid) from public, anon;
grant execute on function public.is_club_manager(uuid) to authenticated;

create or replace function public.set_club_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_club_updated_at() from public, anon, authenticated;

create trigger clubs_set_updated_at before update on public.clubs
for each row execute function public.set_club_updated_at();

create trigger club_announcements_set_updated_at before update on public.club_announcements
for each row execute function public.set_club_updated_at();

create or replace function public.protect_club_announcement_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.club_id is distinct from old.club_id
    or new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Protected announcement fields cannot be changed' using errcode = '42501';
  end if;

  if old.status = 'removed' then
    raise exception 'Removed announcements cannot be changed' using errcode = '42501';
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  elsif new.status <> 'published' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_club_announcement_fields() from public, anon, authenticated;
create trigger club_announcements_protect_fields
before update on public.club_announcements
for each row execute function public.protect_club_announcement_fields();

alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.club_announcements enable row level security;

revoke all on table public.clubs, public.club_memberships, public.club_announcements from anon, authenticated;
grant select on table public.clubs to authenticated;
grant select on table public.club_memberships to authenticated;
grant select, insert (club_id, author_id, title, body, status, published_at),
  update (title, body, status, published_at)
on table public.club_announcements to authenticated;

create policy "Signed-in students can read clubs"
on public.clubs for select to authenticated using (true);

create policy "Members can read own membership and administrators read all"
on public.club_memberships for select to authenticated
using (user_id = (select auth.uid()) or public.current_user_role() = 'administrator');

create policy "Published announcements and managers are readable"
on public.club_announcements for select to authenticated
using (status = 'published' or public.is_club_manager(club_id));

create policy "Verified club managers can create announcements"
on public.club_announcements for insert to authenticated
with check (
  author_id = (select auth.uid())
  and status in ('draft', 'published')
  and public.is_club_manager(club_id)
);

create policy "Verified club managers can update announcements"
on public.club_announcements for update to authenticated
using (status <> 'removed' and public.is_club_manager(club_id))
with check (status in ('draft', 'published', 'removed') and public.is_club_manager(club_id));

create or replace function public.request_club_verification(requested_club_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.club_memberships
    where club_id = requested_club_id and user_id = auth.uid() and role = 'representative'
  ) then
    raise exception 'Club representative required' using errcode = '42501';
  end if;

  update public.clubs
  set verification_status = 'pending', verification_reason = null,
      verification_requested_at = now(), verification_reviewed_at = null,
      verification_reviewed_by = null
  where id = requested_club_id and verification_status <> 'verified';
end;
$$;

revoke all on function public.request_club_verification(uuid) from public, anon;
grant execute on function public.request_club_verification(uuid) to authenticated;

create or replace function public.review_club_verification(
  requested_club_id uuid,
  decision text,
  decision_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'administrator' then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;
  if decision not in ('verified', 'rejected')
    or (decision = 'rejected' and char_length(trim(coalesce(decision_reason, ''))) not between 3 and 500)
  then
    raise exception 'Invalid verification decision' using errcode = '22023';
  end if;

  update public.clubs
  set verification_status = decision,
      verification_reason = case when decision = 'rejected' then trim(decision_reason) else null end,
      verification_reviewed_at = now(), verification_reviewed_by = auth.uid()
  where id = requested_club_id;

  if not found then
    raise exception 'Club not found' using errcode = 'P0002';
  end if;

  perform public.write_audit_log(
    'club.verification.' || decision,
    'club',
    requested_club_id,
    nullif(trim(decision_reason), ''),
    jsonb_build_object('decision', decision)
  );
end;
$$;

revoke all on function public.review_club_verification(uuid, text, text) from public, anon;
grant execute on function public.review_club_verification(uuid, text, text) to authenticated;

commit;
