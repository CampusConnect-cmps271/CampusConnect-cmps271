-- SCRUM-159 SP2-36: private conversations between two students.
--
-- A conversation holds exactly two students, stored in a fixed order so a
-- pair can never have two conversations. Each student keeps their own read
-- state for the unread marker. Messages cannot be edited or deleted.
--
-- Suspension (SP2-32) is not handled here. Its hook is a restrictive insert
-- policy on messages plus a check in start_conversation.
begin;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  student_a uuid not null references public.profiles(id) on delete cascade,
  student_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Null until the first message; the inbox lists only conversations with one.
  last_message_at timestamptz,

  -- The lower id always goes first, so (A, B) and (B, A) are the same row.
  constraint conversations_pair_ordered
    check (student_a < student_b),

  constraint conversations_pair_unique
    unique (student_a, student_b)
);

-- The unique constraint's index covers lookups by student_a.
create index conversations_student_b_idx
on public.conversations (student_b);

create table public.conversation_reads (
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),

  primary key (conversation_id, user_id)
);

create index conversation_reads_user_id_idx
on public.conversation_reads (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),

  -- The app trims before saving, so this is the length after trimming.
  constraint messages_body_length
    check (char_length(body) between 1 and 2000 and body ~ '\S')
);

create index messages_conversation_created_idx
on public.messages (conversation_id, created_at);

create index messages_sender_id_idx
on public.messages (sender_id);

alter table public.conversations enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.messages enable row level security;

-- Supabase's default privileges grant anon and authenticated everything on
-- new tables. Start from nothing, then grant only what clients need.
revoke all on public.conversations from anon, authenticated;
revoke all on public.conversation_reads from anon, authenticated;
revoke all on public.messages from anon, authenticated;

-- Conversations and read rows are created by start_conversation, and
-- last_message_at is kept by a trigger; clients only read them.
grant select on public.conversations to authenticated;

grant select on public.conversation_reads to authenticated;
grant update (last_read_at) on public.conversation_reads to authenticated;

-- id and created_at always come from the database.
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.conversation_reads to service_role;
grant select, insert, update, delete on public.messages to service_role;

create policy "Students can read their own conversations"
on public.conversations
for select
to authenticated
using ((select auth.uid()) in (student_a, student_b));

create policy "Students can read their own read state"
on public.conversation_reads
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Students can update their own read state"
on public.conversation_reads
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Realtime checks this policy for every subscriber before delivering an
-- inserted message, so only the two participants receive it.
create policy "Participants can read their conversation's messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (select auth.uid()) in (conversations.student_a, conversations.student_b)
  )
);

create policy "Participants can send messages as themselves"
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (select auth.uid()) in (conversations.student_a, conversations.student_b)
  )
);

-- No update or delete policy: messages are permanent.

-- Returns the conversation between the signed-in student and other_user,
-- creating it the first time. Security definer because clients cannot insert
-- conversations. On a race between the two students, the unique constraint
-- lets one insert win; the other waits for it, then reads the same row.
create or replace function public.start_conversation(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  first_student uuid;
  second_student uuid;
  result_id uuid;
begin
  if me is null then
    raise exception 'Sign in to send messages'
      using errcode = '42501';
  end if;

  if other_user is null or other_user = me then
    raise exception 'You cannot start a conversation with yourself'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'No student has that id'
      using errcode = 'P0002';
  end if;

  first_student := least(me, other_user);
  second_student := greatest(me, other_user);

  insert into public.conversations (student_a, student_b)
  values (first_student, second_student)
  on conflict (student_a, student_b) do nothing
  returning id into result_id;

  if result_id is not null then
    insert into public.conversation_reads (conversation_id, user_id)
    values (result_id, first_student), (result_id, second_student);

    return result_id;
  end if;

  select c.id
  into result_id
  from public.conversations as c
  where c.student_a = first_student
    and c.student_b = second_student;

  return result_id;
end;
$$;

revoke all on function public.start_conversation(uuid)
from public, anon, authenticated;

grant execute on function public.start_conversation(uuid) to authenticated;

-- Keeps the inbox order current. Security definer because the sender cannot
-- update conversations.
create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
  where id = new.conversation_id;

  return null;
end;
$$;

revoke all on function public.touch_conversation_last_message()
from public, anon, authenticated;

create trigger messages_touch_conversation
after insert on public.messages
for each row
execute function public.touch_conversation_last_message();

-- The signed-in student's inbox, newest first: the other student, a preview
-- of the last message (whitespace collapsed, first 100 characters) and
-- whether the other student has written since this student last read it.
-- Conversations without messages are left out. Runs as the caller, so RLS
-- limits it to their own conversations.
create or replace function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_user_name text,
  last_message_preview text,
  last_message_at timestamptz,
  unread boolean
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    other.id,
    other.full_name,
    last_message.preview,
    c.last_message_at,
    exists (
      select 1
      from public.messages as m
      where m.conversation_id = c.id
        and m.sender_id <> (select auth.uid())
        and m.created_at > coalesce(r.last_read_at, '-infinity')
    )
  from public.conversations as c
  join public.profiles as other
    on other.id = case
      when c.student_a = (select auth.uid()) then c.student_b
      else c.student_a
    end
  left join public.conversation_reads as r
    on r.conversation_id = c.id
   and r.user_id = (select auth.uid())
  cross join lateral (
    select left(btrim(regexp_replace(m.body, '\s+', ' ', 'g')), 100) as preview
    from public.messages as m
    where m.conversation_id = c.id
    order by m.created_at desc, m.id desc
    limit 1
  ) as last_message
  where (select auth.uid()) in (c.student_a, c.student_b)
  order by c.last_message_at desc, c.id;
$$;

revoke all on function public.list_my_conversations()
from public, anon, authenticated;

grant execute on function public.list_my_conversations() to authenticated;

-- How many conversations hold a message the signed-in student has not read,
-- for the Messages link in the header.
create or replace function public.count_my_unread_conversations()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.conversation_reads as r
  where r.user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages as m
      where m.conversation_id = r.conversation_id
        and m.sender_id <> r.user_id
        and m.created_at > r.last_read_at
    );
$$;

revoke all on function public.count_my_unread_conversations()
from public, anon, authenticated;

grant execute on function public.count_my_unread_conversations() to authenticated;

-- Realtime (Postgres Changes) streams inserted messages to the open thread
-- and the inbox. Supabase projects have this publication; PGlite and other
-- bare Postgres databases do not.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
      and not puballtables
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

commit;
