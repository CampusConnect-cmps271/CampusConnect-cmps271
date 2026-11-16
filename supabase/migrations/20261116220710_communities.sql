-- SCRUM-246 SP4-04: communities, their members and followers, and posts
-- inside them.
--
-- A community post is a normal post linked to its community through
-- community_posts, the way SkillSwap posts are linked to their details. The
-- feed, search, comments, upvotes, saving, pinning, reporting, restrictions,
-- moderator removal and suspension all apply to it unchanged. Nothing here
-- adds a column to posts or changes its policies or existing triggers.
--
-- Communities are public: every signed-in student can read them, their
-- members, followers and posts. Joining makes you a member (you can post) and
-- a follower; following alone puts the community's posts in your Following
-- feed. The creator is the owner and cannot leave; they archive instead.
begin;

-- ------------------------------------------------------------------ tables

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  -- Filled from the name by set_community_slug() when left out.
  slug text not null,
  name text not null,
  description text,
  topic text not null,
  course_id uuid references public.courses(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Slugs stay unique across archived communities too, so links never move.
  constraint communities_slug_unique unique (slug),

  constraint communities_slug_format
    check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  constraint communities_name_valid
    check (
      char_length(name) between 3 and 80
      and name = btrim(name)
      and name !~ '[[:cntrl:]]'
    ),

  constraint communities_description_valid
    check (
      description is null
      or (char_length(description) between 1 and 500 and description = btrim(description))
    ),

  constraint communities_topic_check
    check (topic in ('course', 'interest', 'student_life', 'housing', 'other')),

  -- A course community names its course; no other topic has one.
  constraint communities_course_matches_topic
    check ((topic = 'course') = (course_id is not null)),

  constraint communities_status_check
    check (status in ('active', 'archived')),

  constraint communities_archive_pair
    check ((status = 'archived') = (archived_at is not null))
);

-- Names are unique, ignoring case, among active communities only: archiving
-- one frees its name.
create unique index communities_active_name_unique
on public.communities (lower(name))
where status = 'active';

-- The creation limits count a student's communities.
create index communities_owner_created_idx
on public.communities (owner_id, created_at desc);

-- Course pages and suggestions look communities up by course.
create index communities_course_idx
on public.communities (course_id)
where course_id is not null;

create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),

  primary key (community_id, student_id),

  constraint community_members_role_check
    check (role in ('owner', 'member'))
);

-- One owner per community.
create unique index community_members_one_owner
on public.community_members (community_id)
where role = 'owner';

-- "Your communities" reads a student's memberships.
create index community_members_student_idx
on public.community_members (student_id, joined_at desc);

create table public.community_follows (
  community_id uuid not null references public.communities(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  followed_at timestamptz not null default now(),

  primary key (community_id, student_id)
);

create index community_follows_student_idx
on public.community_follows (student_id, followed_at desc);

create table public.community_posts (
  post_id uuid primary key references public.posts(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  -- The post's own created_at: both are now() in the creating transaction.
  created_at timestamptz not null default now()
);

-- A community's posts, newest first, and its latest post time.
create index community_posts_community_idx
on public.community_posts (community_id, created_at desc, post_id desc);

-- ------------------------------------------------------------- privileges

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_follows enable row level security;
alter table public.community_posts enable row level security;

-- Supabase's default privileges grant anon and authenticated everything on
-- new tables. Start from nothing, then grant only what clients need.
revoke all on public.communities from anon, authenticated;
revoke all on public.community_members from anon, authenticated;
revoke all on public.community_follows from anon, authenticated;
revoke all on public.community_posts from anon, authenticated;

-- Communities and their links are created only by the functions below.
-- The owner edits the name, description and topic; course_id moves with the
-- topic, since a course community must name its course.
grant select on public.communities to authenticated;
grant update (name, description, topic, course_id) on public.communities to authenticated;

grant select, delete on public.community_members to authenticated;
grant insert (community_id, student_id) on public.community_members to authenticated;

grant select, delete on public.community_follows to authenticated;
grant insert (community_id, student_id) on public.community_follows to authenticated;

grant select on public.community_posts to authenticated;

-- The demo seed writes with the service role.
grant select, insert, update, delete on public.communities to service_role;
grant select, insert, update, delete on public.community_members to service_role;
grant select, insert, update, delete on public.community_follows to service_role;
grant select, insert, update, delete on public.community_posts to service_role;

-- ---------------------------------------------------------------- policies

create policy "Signed-in students can read communities"
on public.communities
for select
to authenticated
using (true);

create policy "Owners can edit their active communities"
on public.communities
for update
to authenticated
using (
  owner_id = (select auth.uid())
  and status = 'active'
  and not public.is_current_user_suspended()
)
with check (
  owner_id = (select auth.uid())
  and status = 'active'
  and not public.is_current_user_suspended()
);

create policy "Signed-in students can read memberships"
on public.community_members
for select
to authenticated
using (true);

create policy "Students can join active communities as themselves"
on public.community_members
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and role = 'member'
  and not public.is_current_user_suspended()
  and exists (
    select 1
    from public.communities c
    where c.id = community_members.community_id
      and c.status = 'active'
  )
);

-- The owner's row is role 'owner', so the owner cannot leave.
create policy "Members can leave active communities"
on public.community_members
for delete
to authenticated
using (
  student_id = (select auth.uid())
  and role = 'member'
  and exists (
    select 1
    from public.communities c
    where c.id = community_members.community_id
      and c.status = 'active'
  )
);

create policy "Signed-in students can read follows"
on public.community_follows
for select
to authenticated
using (true);

create policy "Students can follow active communities as themselves"
on public.community_follows
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and not public.is_current_user_suspended()
  and exists (
    select 1
    from public.communities c
    where c.id = community_follows.community_id
      and c.status = 'active'
  )
);

create policy "Students can unfollow active communities"
on public.community_follows
for delete
to authenticated
using (
  student_id = (select auth.uid())
  and exists (
    select 1
    from public.communities c
    where c.id = community_follows.community_id
      and c.status = 'active'
  )
);

-- Visible exactly when the post is, under the posts policies.
create policy "Students can read links of posts they can read"
on public.community_posts
for select
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = community_posts.post_id
  )
);

-- ---------------------------------------------------------------- triggers

-- Fills a missing slug from the name: lowercase ASCII letters and digits
-- joined by hyphens, at most 50 characters, then -2, -3, ... on a clash. A
-- name with too few of them (an Arabic name, say) starts from "community".
create or replace function public.set_community_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  base text;
  candidate text;
  suffix integer := 1;
begin
  if new.slug is not null then
    return new;
  end if;

  base := btrim(regexp_replace(lower(coalesce(new.name, '')), '[^a-z0-9]+', '-', 'g'), '-');
  base := btrim(left(base, 50), '-');

  if char_length(base) < 3 then
    base := btrim('community-' || base, '-');
  end if;

  candidate := base;

  while exists (select 1 from public.communities c where c.slug = candidate) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

revoke all on function public.set_community_slug() from public, anon, authenticated;

create trigger set_community_slug
before insert on public.communities
for each row
execute function public.set_community_slug();

create or replace function public.set_community_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_community_updated_at() from public, anon, authenticated;

create trigger set_community_updated_at
before update on public.communities
for each row
execute function public.set_community_updated_at();

-- An author deleting a community post takes it out of its community. A new
-- trigger beside the existing ones; a moderator's removal keeps the link, and
-- the removed post drops out of every list because lists read published posts.
create or replace function public.unlink_deleted_community_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.community_posts where post_id = new.id;
  return null;
end;
$$;

revoke all on function public.unlink_deleted_community_post() from public, anon, authenticated;

create trigger unlink_deleted_community_post
after update of status on public.posts
for each row
when (new.status = 'deleted' and old.status is distinct from 'deleted')
execute function public.unlink_deleted_community_post();

-- ------------------------------------------------------------------- views

-- Each community with its member and follower counts and latest activity.
-- Security invoker: the reader's policies apply, so the latest post time
-- counts only posts the reader can see as published. Counted through the
-- primary keys and community_posts_community_idx; cheap at our scale.
create view public.community_overview
with (security_invoker = true)
as
select
  c.id,
  c.slug,
  c.name,
  c.description,
  c.topic,
  c.course_id,
  co.code as course_code,
  co.name as course_name,
  c.owner_id,
  c.status,
  c.archived_at,
  c.created_at,
  c.updated_at,
  (select count(*) from public.community_members m where m.community_id = c.id)::integer as member_count,
  (select count(*) from public.community_follows f where f.community_id = c.id)::integer as follower_count,
  latest.last_post_at,
  greatest(c.created_at, latest.last_post_at) as last_activity_at
from public.communities c
left join public.courses co on co.id = c.course_id
left join lateral (
  select max(cp.created_at) as last_post_at
  from public.community_posts cp
  join public.posts p on p.id = cp.post_id and p.status = 'published'
  where cp.community_id = c.id
) latest on true;

-- Published community posts with their community, for a community's page
-- and the Following feed.
create view public.community_post_feed
with (security_invoker = true)
as
select
  cp.community_id,
  c.slug as community_slug,
  c.name as community_name,
  p.id,
  p.author_id,
  p.title,
  p.body,
  p.category,
  p.created_at,
  p.edited_at,
  (select count(*) from public.post_upvotes u where u.post_id = p.id)::integer as upvote_count,
  (select count(*) from public.post_comments pc where pc.post_id = p.id and pc.status = 'published')::integer as comment_count
from public.community_posts cp
join public.posts p on p.id = cp.post_id and p.status = 'published'
join public.communities c on c.id = cp.community_id;

revoke all on public.community_overview from anon, authenticated;
revoke all on public.community_post_feed from anon, authenticated;
grant select on public.community_overview to authenticated, service_role;
grant select on public.community_post_feed to authenticated, service_role;

-- --------------------------------------------------------------- functions

-- Creates a community with its owner's membership and follow. Security
-- definer, because clients cannot insert communities directly; it applies
-- the suspension rule posts use and the creation limits itself.
create or replace function public.create_community(
  community_name text,
  community_description text,
  community_topic text,
  community_course_id uuid default null
)
returns table (id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  clean_name text := btrim(regexp_replace(coalesce(community_name, ''), '\s+', ' ', 'g'));
  clean_description text := nullif(btrim(coalesce(community_description, '')), '');
  created public.communities%rowtype;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if public.is_current_user_suspended() then
    raise exception 'Suspended accounts cannot create communities' using errcode = '42501';
  end if;

  if (
    select count(*)
    from public.communities c
    where c.owner_id = caller
      and c.created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'Daily community limit reached' using errcode = 'CM001';
  end if;

  if (
    select count(*)
    from public.communities c
    where c.owner_id = caller
      and c.status = 'active'
  ) >= 20 then
    raise exception 'Active community limit reached' using errcode = 'CM002';
  end if;

  if exists (
    select 1
    from public.communities c
    where lower(c.name) = lower(clean_name)
      and c.status = 'active'
  ) then
    raise exception 'A community with this name already exists' using errcode = '23505';
  end if;

  insert into public.communities (name, description, topic, course_id, owner_id)
  values (clean_name, clean_description, community_topic, community_course_id, caller)
  returning * into created;

  insert into public.community_members (community_id, student_id, role)
  values (created.id, caller, 'owner');

  insert into public.community_follows (community_id, student_id)
  values (created.id, caller);

  id := created.id;
  slug := created.slug;
  return next;
end;
$$;

revoke all on function public.create_community(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_community(text, text, text, uuid) to authenticated;

-- Joins an active community, which also follows it. Security invoker: the
-- membership and follow policies apply.
create or replace function public.join_community(target_community_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  community_status text;
  joined integer;
begin
  select c.status into community_status
  from public.communities c
  where c.id = target_community_id;

  if not found then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  if community_status <> 'active' then
    raise exception 'Community is archived' using errcode = 'CM010';
  end if;

  insert into public.community_members (community_id, student_id)
  values (target_community_id, (select auth.uid()))
  on conflict do nothing;

  get diagnostics joined = row_count;

  -- Joining again changes nothing, so it does not re-follow someone who
  -- chose to unfollow.
  if joined > 0 then
    insert into public.community_follows (community_id, student_id)
    values (target_community_id, (select auth.uid()))
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.join_community(uuid) from public, anon, authenticated;
grant execute on function public.join_community(uuid) to authenticated;

-- Leaves a community, which also unfollows it. Security invoker: the delete
-- policies refuse the owner and archived communities; this names why.
create or replace function public.leave_community(target_community_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  community_status text;
  my_role text;
begin
  select c.status into community_status
  from public.communities c
  where c.id = target_community_id;

  if not found then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  if community_status <> 'active' then
    raise exception 'Community is archived' using errcode = 'CM010';
  end if;

  select m.role into my_role
  from public.community_members m
  where m.community_id = target_community_id
    and m.student_id = (select auth.uid());

  if my_role = 'owner' then
    raise exception 'The owner cannot leave their community' using errcode = 'CM012';
  end if;

  if my_role is null then
    raise exception 'Not a member' using errcode = 'CM011';
  end if;

  delete from public.community_members m
  where m.community_id = target_community_id
    and m.student_id = (select auth.uid());

  delete from public.community_follows f
  where f.community_id = target_community_id
    and f.student_id = (select auth.uid());
end;
$$;

revoke all on function public.leave_community(uuid) from public, anon, authenticated;
grant execute on function public.leave_community(uuid) to authenticated;

-- Links a post written in this same transaction to a community its author
-- is a member of. Security definer, because clients cannot insert links;
-- only create_community_post() calls it. The created_at check means a link
-- can only be made in the transaction that wrote the post, so calling this
-- directly cannot move an older post into a community.
create or replace function public.link_community_post(new_post_id uuid, target_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.posts p
    where p.id = new_post_id
      and p.author_id = auth.uid()
      and p.status = 'published'
      and p.created_at = now()
  ) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.community_members m
    join public.communities c on c.id = m.community_id
    where m.community_id = target_community_id
      and m.student_id = auth.uid()
      and c.status = 'active'
  ) then
    raise exception 'Not a member of an active community' using errcode = 'CM011';
  end if;

  insert into public.community_posts (post_id, community_id)
  values (new_post_id, target_community_id);
end;
$$;

revoke all on function public.link_community_post(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_community_post(uuid, uuid) to authenticated;

-- Writes a post in a community: the post goes in through the normal insert,
-- so the posts policies (suspension included) and triggers apply, and the
-- link follows in the same transaction. Security invoker.
create or replace function public.create_community_post(
  target_community_id uuid,
  post_title text,
  post_body text,
  post_category text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  community_status text;
  new_post_id uuid;
begin
  select c.status into community_status
  from public.communities c
  where c.id = target_community_id;

  if not found then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  if community_status <> 'active' then
    raise exception 'Community is archived' using errcode = 'CM010';
  end if;

  if not exists (
    select 1
    from public.community_members m
    where m.community_id = target_community_id
      and m.student_id = (select auth.uid())
  ) then
    raise exception 'Not a member' using errcode = 'CM011';
  end if;

  -- One of the normal categories. SkillSwap posts need their own details.
  if post_category = 'SkillSwap'
    or not exists (select 1 from public.categories k where k.name = post_category)
  then
    raise exception 'Invalid category' using errcode = '22023';
  end if;

  insert into public.posts (author_id, title, body, category)
  values ((select auth.uid()), btrim(post_title), btrim(post_body), post_category)
  returning id into new_post_id;

  perform public.link_community_post(new_post_id, target_community_id);

  return new_post_id;
end;
$$;

revoke all on function public.create_community_post(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_community_post(uuid, text, text, text) to authenticated;

-- Archives a community: it leaves discovery and takes no new members or
-- posts; its page and posts stay readable. The owner, a moderator or an
-- administrator may do it. Security definer, because the status columns are
-- not granted to anyone. It records who and when, and writes the audit log
-- row a moderation action writes; write_audit_log() itself accepts only
-- moderators, so the row is inserted here for owners too.
create or replace function public.archive_community(target_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_role text := coalesce(public.current_user_role()::text, '');
  community public.communities%rowtype;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into community
  from public.communities c
  where c.id = target_community_id
  for update;

  if not found then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  if community.owner_id <> caller and caller_role not in ('moderator', 'administrator') then
    raise exception 'Only the owner, a moderator or an administrator can archive a community'
      using errcode = '42501';
  end if;

  if community.status = 'archived' then
    raise exception 'Community is archived' using errcode = 'CM010';
  end if;

  update public.communities c
  set status = 'archived',
      archived_at = now(),
      archived_by = caller
  where c.id = target_community_id;

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (
    caller,
    'community.archived',
    'community',
    target_community_id,
    jsonb_build_object('as', case when community.owner_id = caller then 'owner' else caller_role end)
  );
end;
$$;

revoke all on function public.archive_community(uuid) from public, anon, authenticated;
grant execute on function public.archive_community(uuid) to authenticated;

commit;
