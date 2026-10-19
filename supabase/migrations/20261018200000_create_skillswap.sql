-- SCRUM-176 SP2-53: SkillSwap posts.
--
-- A SkillSwap post is a normal post in the SkillSwap category, so the feed,
-- comments, upvotes, saving, pinning, reports and moderation all apply. Its
-- structured fields live in post_skillswap, one row per post; the post's
-- title and body are built from them by skillswap_post_text(), so the feed
-- excerpt and post search work unchanged.
begin;

insert into public.categories (name)
values ('SkillSwap')
on conflict (name) do nothing;

create table public.post_skillswap (
  post_id uuid primary key references public.posts(id) on delete cascade,
  can_teach text not null,
  wants_to_learn text not null,
  meeting_method text not null default 'either',
  availability text,
  -- Optional extra details, also appended to the post's body.
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint post_skillswap_can_teach_length
    check (char_length(btrim(can_teach, E' \t\r\n')) between 1 and 300),

  constraint post_skillswap_wants_to_learn_length
    check (char_length(btrim(wants_to_learn, E' \t\r\n')) between 1 and 300),

  constraint post_skillswap_meeting_method_check
    check (meeting_method in ('online', 'in_person', 'either')),

  constraint post_skillswap_availability_length
    check (availability is null or char_length(btrim(availability, E' \t\r\n')) between 1 and 120),

  constraint post_skillswap_details_length
    check (details is null or char_length(btrim(details, E' \t\r\n')) between 1 and 2000)
);

-- The board lists newest first.
create index post_skillswap_created_idx
on public.post_skillswap (created_at desc, post_id desc);

alter table public.post_skillswap enable row level security;

-- Supabase's default privileges grant anon and authenticated everything on
-- new tables. Start from nothing, then grant only what clients need.
revoke all on public.post_skillswap from anon, authenticated;

grant select on public.post_skillswap to authenticated;
grant insert (post_id, can_teach, wants_to_learn, meeting_method, availability, details)
on public.post_skillswap to authenticated;
grant update (can_teach, wants_to_learn, meeting_method, availability, details)
on public.post_skillswap to authenticated;

grant select, insert, update, delete on public.post_skillswap to service_role;

-- Visible exactly when the post is: published, or the reader wrote it.
create policy "Students can read SkillSwap details of visible posts"
on public.post_skillswap
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_skillswap.post_id
      and (posts.status = 'published' or posts.author_id = (select auth.uid()))
  )
);

create policy "Authors can add details to their published SkillSwap posts"
on public.post_skillswap
for insert
to authenticated
with check (
  exists (
    select 1
    from public.posts
    where posts.id = post_skillswap.post_id
      and posts.author_id = (select auth.uid())
      and posts.status = 'published'
      and posts.category = 'SkillSwap'
  )
);

create policy "Authors can edit details of their published SkillSwap posts"
on public.post_skillswap
for update
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_skillswap.post_id
      and posts.author_id = (select auth.uid())
      and posts.status = 'published'
  )
)
with check (
  exists (
    select 1
    from public.posts
    where posts.id = post_skillswap.post_id
      and posts.author_id = (select auth.uid())
      and posts.status = 'published'
  )
);

-- No delete policy: a deleted post hides its row, and a removed account's
-- posts take their rows with them.

create or replace function public.set_skillswap_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_skillswap_updated_at()
from public, anon, authenticated;

create trigger set_skillswap_updated_at
before update on public.post_skillswap
for each row
execute function public.set_skillswap_updated_at();

-- The post's title and body, built from the SkillSwap fields. The one place
-- this text is written: the create and update functions and the demo seed
-- all use it. Inputs are trimmed; the boxes are collapsed onto one line for
-- the title, which shares its 200 characters between them.
create or replace function public.skillswap_post_text(
  can_teach text,
  wants_to_learn text,
  meeting_method text,
  availability text default null,
  details text default null
)
returns table (title text, body text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  teach text := btrim(can_teach, E' \t\r\n');
  learn text := btrim(wants_to_learn, E' \t\r\n');
  teach_line text := btrim(regexp_replace(can_teach, '\s+', ' ', 'g'));
  learn_line text := btrim(regexp_replace(wants_to_learn, '\s+', ' ', 'g'));
  when_free text := nullif(btrim(availability, E' \t\r\n'), '');
  more text := nullif(btrim(details, E' \t\r\n'), '');
  -- 200 minus "Can teach: " (11) and " · Wants to learn: " (19).
  room constant integer := 170;
  teach_room integer;
  learn_room integer;
begin
  -- Each box gets half the room, plus whatever the other one does not need.
  teach_room := greatest(room / 2, room - char_length(learn_line));
  learn_room := room - least(char_length(teach_line), teach_room);

  if char_length(teach_line) > teach_room then
    teach_line := btrim(left(teach_line, teach_room - 1)) || '…';
  end if;

  if char_length(learn_line) > learn_room then
    learn_line := btrim(left(learn_line, learn_room - 1)) || '…';
  end if;

  title := 'Can teach: ' || teach_line || ' · Wants to learn: ' || learn_line;

  body := 'Can teach: ' || teach || E'\n\n'
    || 'Wants to learn: ' || learn || E'\n\n'
    || 'Meeting: ' || case meeting_method
      when 'online' then 'Online'
      when 'in_person' then 'In person'
      else 'Online or in person'
    end
    || coalesce(E'\n' || 'Availability: ' || when_free, '')
    || coalesce(E'\n\n' || more, '');

  return next;
end;
$$;

revoke all on function public.skillswap_post_text(text, text, text, text, text)
from public, anon;

grant execute on function public.skillswap_post_text(text, text, text, text, text)
to authenticated, service_role;

-- Creates a SkillSwap post and its details in one transaction. Security
-- invoker: the posts and post_skillswap policies (and any suspension rules
-- added to them) apply to the caller.
create or replace function public.create_skillswap_post(
  can_teach text,
  wants_to_learn text,
  meeting_method text default 'either',
  availability text default null,
  details text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  built record;
  new_post_id uuid;
begin
  select * into built
  from public.skillswap_post_text(can_teach, wants_to_learn, meeting_method, availability, details);

  insert into public.posts (author_id, title, body, category)
  values ((select auth.uid()), built.title, built.body, 'SkillSwap')
  returning id into new_post_id;

  insert into public.post_skillswap (post_id, can_teach, wants_to_learn, meeting_method, availability, details)
  values (
    new_post_id,
    btrim(can_teach, E' \t\r\n'),
    btrim(wants_to_learn, E' \t\r\n'),
    meeting_method,
    nullif(btrim(availability, E' \t\r\n'), ''),
    nullif(btrim(details, E' \t\r\n'), '')
  );

  return new_post_id;
end;
$$;

revoke all on function public.create_skillswap_post(text, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.create_skillswap_post(text, text, text, text, text)
to authenticated;

-- Rewrites a SkillSwap post and its details in one transaction, and marks
-- the post edited like a normal edit. RLS limits it to the author's
-- published SkillSwap posts; anything else is "not found".
create or replace function public.update_skillswap_post(
  post_id uuid,
  can_teach text,
  wants_to_learn text,
  meeting_method text default 'either',
  availability text default null,
  details text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  built record;
begin
  select * into built
  from public.skillswap_post_text(can_teach, wants_to_learn, meeting_method, availability, details);

  update public.posts as p
  set title = built.title,
      body = built.body,
      edited_at = now()
  where p.id = update_skillswap_post.post_id
    and p.category = 'SkillSwap'
    and p.status = 'published';

  if not found then
    raise exception 'SkillSwap post not found'
      using errcode = 'P0002';
  end if;

  update public.post_skillswap as s
  set can_teach = btrim(update_skillswap_post.can_teach, E' \t\r\n'),
      wants_to_learn = btrim(update_skillswap_post.wants_to_learn, E' \t\r\n'),
      meeting_method = update_skillswap_post.meeting_method,
      availability = nullif(btrim(update_skillswap_post.availability, E' \t\r\n'), ''),
      details = nullif(btrim(update_skillswap_post.details, E' \t\r\n'), '')
  where s.post_id = update_skillswap_post.post_id;

  if not found then
    raise exception 'SkillSwap post not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_skillswap_post(uuid, text, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.update_skillswap_post(uuid, text, text, text, text, text)
to authenticated;

-- A post never moves into or out of SkillSwap, so the normal editor cannot
-- leave details without their post or a SkillSwap post without details.
create or replace function public.keep_skillswap_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.category = 'SkillSwap') <> (new.category = 'SkillSwap') then
    raise exception 'A post cannot move into or out of the SkillSwap category'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.keep_skillswap_category()
from public, anon, authenticated;

create trigger posts_keep_skillswap_category
before update of category on public.posts
for each row
execute function public.keep_skillswap_category();

commit;
