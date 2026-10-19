-- SCRUM-163 SP2-40: in-app notifications.
--
-- One row per thing a student should hear about. Rows link to the related
-- conversation, post or comment and never copy message or comment text; the
-- app builds the sentence from the type and the actor's name. Rows are
-- created only by the triggers in the next migration.
begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  -- Who did it. Null when it should not be named (a moderator).
  actor_id uuid references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,

  constraint notifications_type_check
    check (type in ('message', 'post_comment', 'comment_reply', 'content_removed')),

  -- Each type carries the links its sentence and destination need.
  constraint notifications_links_check
    check (
      case type
        when 'message' then actor_id is not null and conversation_id is not null
        when 'post_comment' then actor_id is not null and post_id is not null and comment_id is not null
        when 'comment_reply' then actor_id is not null and post_id is not null and comment_id is not null
        when 'content_removed' then post_id is not null or comment_id is not null
      end
    )
);

-- The bell and the notifications page: a student's newest first.
create index notifications_recipient_newest_idx
on public.notifications (recipient_id, created_at desc);

-- The unread count.
create index notifications_unread_idx
on public.notifications (recipient_id)
where read_at is null;

-- At most one unread message notification per conversation, so a chat
-- updates one row instead of flooding the bell.
create unique index notifications_unread_message_idx
on public.notifications (recipient_id, conversation_id)
where type = 'message' and read_at is null;

-- Indexes for the cascading foreign keys.
create index notifications_actor_id_idx on public.notifications (actor_id);
create index notifications_conversation_id_idx on public.notifications (conversation_id);
create index notifications_post_id_idx on public.notifications (post_id);
create index notifications_comment_id_idx on public.notifications (comment_id);

alter table public.notifications enable row level security;

-- Supabase's default privileges grant anon and authenticated everything on
-- new tables. Start from nothing, then grant only what clients need.
revoke all on public.notifications from anon, authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select, insert, update, delete on public.notifications to service_role;

-- Realtime checks this policy for every subscriber, so a student only
-- receives changes to their own notifications.
create policy "Students can read their own notifications"
on public.notifications
for select
to authenticated
using (recipient_id = (select auth.uid()));

create policy "Students can mark their own notifications read"
on public.notifications
for update
to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

-- No insert or delete policy: rows come only from the notification triggers
-- and leave through retention or a cascade.

-- Retention: read notifications go after 60 days. A function, so the rule
-- can be tested where pg_cron is not available.
create or replace function public.delete_old_read_notifications()
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from public.notifications
    where read_at is not null
      and created_at < now() - interval '60 days'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.delete_old_read_notifications()
from public, anon, authenticated;

-- pg_cron is installed by the app_logs migration on Supabase; PGlite has
-- no pg_cron. Scheduling by name is an upsert, so re-running is safe.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'delete-old-read-notifications',
      '15 3 * * *',
      'select public.delete_old_read_notifications()'
    );
  end if;
end;
$$;

-- Realtime (Postgres Changes) keeps the bell current. Supabase projects
-- have this publication; PGlite and other bare Postgres databases do not.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
      and not puballtables
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
