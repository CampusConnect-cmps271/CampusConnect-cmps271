-- SCRUM-164 SP2-41: the events that create notifications.
--
-- Triggers only, so messaging, comments and moderation need no changes. Each
-- function is security definer because clients cannot insert notifications,
-- and none notifies anyone about their own action.
begin;

-- New message: notify the other participant. While they have an unread
-- message notification for the conversation, that row is updated instead,
-- so a chat does not flood the bell. The unique partial index makes this
-- safe under concurrent sends.
create or replace function public.notify_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
begin
  select case when c.student_a = new.sender_id then c.student_b else c.student_a end
  into recipient
  from public.conversations as c
  where c.id = new.conversation_id;

  if recipient is null or recipient = new.sender_id then
    return null;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, conversation_id, created_at)
  values (recipient, 'message', new.sender_id, new.conversation_id, new.created_at)
  on conflict (recipient_id, conversation_id) where type = 'message' and read_at is null
  do update set actor_id = excluded.actor_id, created_at = excluded.created_at;

  return null;
end;
$$;

revoke all on function public.notify_message_recipient()
from public, anon, authenticated;

create trigger messages_notify_recipient
after insert on public.messages
for each row
execute function public.notify_message_recipient();

-- Reading a conversation also clears its message notification, so the bell
-- and the inbox agree.
create or replace function public.read_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
  set read_at = now()
  where recipient_id = new.user_id
    and conversation_id = new.conversation_id
    and type = 'message'
    and read_at is null
    and created_at <= new.last_read_at;

  return null;
end;
$$;

revoke all on function public.read_message_notifications()
from public, anon, authenticated;

create trigger conversation_reads_clear_notifications
after update of last_read_at on public.conversation_reads
for each row
when (new.last_read_at > old.last_read_at)
execute function public.read_message_notifications();

-- New comment: a reply notifies the author of the comment it answers; any
-- comment notifies the post's author, unless they were just notified as the
-- parent comment's author.
create or replace function public.notify_comment_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author uuid;
  parent_author uuid;
begin
  select p.author_id into post_author
  from public.posts as p
  where p.id = new.post_id;

  if new.parent_id is not null then
    select c.author_id into parent_author
    from public.post_comments as c
    where c.id = new.parent_id;

    if parent_author is not null and parent_author <> new.author_id then
      insert into public.notifications (recipient_id, type, actor_id, post_id, comment_id, created_at)
      values (parent_author, 'comment_reply', new.author_id, new.post_id, new.id, new.created_at);
    end if;
  end if;

  if post_author is not null
    and post_author <> new.author_id
    and post_author is distinct from parent_author
  then
    insert into public.notifications (recipient_id, type, actor_id, post_id, comment_id, created_at)
    values (post_author, 'post_comment', new.author_id, new.post_id, new.id, new.created_at);
  end if;

  return null;
end;
$$;

revoke all on function public.notify_comment_recipients()
from public, anon, authenticated;

create trigger post_comments_notify_recipients
after insert on public.post_comments
for each row
execute function public.notify_comment_recipients();

-- Content removal (SP2-30): a moderator sets a post's status to 'removed'.
-- The moderator is not named. An author deleting their own post ('deleted')
-- notifies no one. Removed comments follow once SP2-30 adds their status.
create or replace function public.notify_post_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, type, post_id)
  values (new.author_id, 'content_removed', new.id);

  return null;
end;
$$;

revoke all on function public.notify_post_removed()
from public, anon, authenticated;

create trigger posts_notify_removed
after update of status on public.posts
for each row
when (old.status = 'published' and new.status = 'removed')
execute function public.notify_post_removed();

commit;
