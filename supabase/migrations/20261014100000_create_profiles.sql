-- SCRUM-183 SP2-60: one profile row per student.
--
-- Names live here so the rest of the app (pinning, messaging, notifications,
-- SkillSwap) can read them without touching Auth data. No email, no Auth
-- metadata: just what a student chooses to show other students.
begin;

-- Each interest is 1-40 characters, at most 10 of them. A check constraint
-- cannot hold a subquery, so the per-item rule lives in this function. It
-- keeps its default EXECUTE grants: the constraint runs as whoever writes the
-- row, and the function only inspects its argument.
create or replace function public.profile_interests_are_valid(items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(items) <= 10
    and not exists (
      select 1
      from unnest(items) as item
      where item is null
         or char_length(btrim(item)) not between 1 and 40
    );
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  major text,
  graduation_year smallint,
  bio text,
  interests text[] not null default '{}',
  pinned_post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_full_name_length
    check (char_length(btrim(full_name)) between 1 and 100),

  constraint profiles_major_length
    check (major is null or char_length(major) <= 100),

  constraint profiles_graduation_year_range
    check (graduation_year is null or graduation_year between 2020 and 2035),

  constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 500),

  constraint profiles_interests_valid
    check (public.profile_interests_are_valid(interests))
);

-- Clearing pins when a post is unpublished looks rows up by this column.
create index profiles_pinned_post_id_idx
on public.profiles (pinned_post_id)
where pinned_post_id is not null;

alter table public.profiles enable row level security;

-- Supabase's default privileges give anon and authenticated every table
-- privilege, which would make the column-level grant below meaningless.
-- Start from nothing, then grant only what clients need.
revoke all on public.profiles from anon, authenticated;

grant select on public.profiles to authenticated;

-- Owners edit these columns only; id and timestamps stay out of reach.
grant update (full_name, major, graduation_year, bio, interests, pinned_post_id)
on public.profiles to authenticated;

grant select, insert, update, delete on public.profiles to service_role;

create policy "Signed-in students can read profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Students can update their own profile"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- No insert or delete policy: rows are created by the trigger below and
-- removed with the Auth user.

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_profile_updated_at()
from public, anon, authenticated;

create trigger set_profile_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();

-- The name a new profile starts with: the registration name (collapsed and
-- trimmed, as the sign-up form does), else the email's local part. Always
-- 1-100 characters, so it can never make a sign-up fail the length check.
create or replace function public.profile_default_name(
  metadata jsonb,
  email text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(left(coalesce(
    nullif(regexp_replace(btrim(metadata ->> 'full_name'), '\s+', ' ', 'g'), ''),
    nullif(regexp_replace(btrim(metadata ->> 'name'), '\s+', ' ', 'g'), ''),
    nullif(btrim(split_part(email, '@', 1)), ''),
    'Student'
  ), 100));
$$;

revoke all on function public.profile_default_name(jsonb, text)
from public, anon, authenticated;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, public.profile_default_name(new.raw_user_meta_data, new.email))
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile()
from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

-- Every account that signed up before this migration gets its row now.
insert into public.profiles (id, full_name)
select id, public.profile_default_name(raw_user_meta_data, email)
from auth.users
on conflict (id) do nothing;

-- SP2-11: a student may pin only a published post they wrote.
--
-- Security definer so the rule does not depend on how posts' RLS changes
-- later. FOR SHARE holds the post while the pin is written, so a concurrent
-- soft delete either waits and then clears this pin, or commits first and
-- this check fails.
create or replace function public.check_profile_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pinned_post_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.pinned_post_id is not distinct from old.pinned_post_id then
    return new;
  end if;

  perform 1
  from public.posts
  where id = new.pinned_post_id
    and author_id = new.id
    and status = 'published'
  for share;

  if not found then
    raise exception 'Only a published post you wrote can be pinned'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.check_profile_pin()
from public, anon, authenticated;

create trigger check_profile_pin
before insert or update of pinned_post_id on public.profiles
for each row
execute function public.check_profile_pin();

-- When a pinned post stops being published (a soft delete today, moderator
-- removal later), its pin goes. Security definer because the person who
-- unpublishes it may not own the profile. Hard deletes are covered by the
-- foreign key's on delete set null.
create or replace function public.clear_unpublished_post_pins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set pinned_post_id = null
  where pinned_post_id = new.id;

  return null;
end;
$$;

revoke all on function public.clear_unpublished_post_pins()
from public, anon, authenticated;

create trigger clear_profile_pins_when_unpublished
after update of status on public.posts
for each row
when (old.status = 'published' and new.status is distinct from 'published')
execute function public.clear_unpublished_post_pins();

commit;
