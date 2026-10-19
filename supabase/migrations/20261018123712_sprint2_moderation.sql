-- SCRUM-52 through SCRUM-57: reporting, moderation, suspensions, and audit.
begin;

-- A removed post remains addressable so students see an explicit moderation
-- notice, while feed queries continue to select only published rows.
alter table public.posts
  drop constraint posts_status_check;

alter table public.posts
  add constraint posts_status_check
  check (status in ('published', 'deleted', 'removed'));

alter table public.post_comments
  add column status text not null default 'published',
  add column removed_at timestamptz,
  add constraint post_comments_status_check
    check (status in ('published', 'removed'));

create index post_comments_status_idx
on public.post_comments (post_id, status, created_at);

-- Existing read policies expose moderation placeholders, but nothing removed
-- appears in the feed or accepts new interaction. Authors keep read access to
-- their own rows: deleting a post is an UPDATE to 'deleted', and Postgres RLS
-- requires the updated row to pass a SELECT policy or the delete is rejected.
drop policy if exists "Students can read published posts" on public.posts;
create policy "Students can read visible posts"
on public.posts
for select
to authenticated
using (
  status in ('published', 'removed')
  or author_id = (select auth.uid())
);

drop policy if exists "Students can read comments on published posts"
on public.post_comments;
create policy "Students can read comments on visible posts"
on public.post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_comments.post_id
      and posts.status in ('published', 'removed')
  )
);

-- The existing trigger protects immutable post fields. Extend its state
-- machine so moderator removal, like author deletion, changes status only.
create or replace function public.protect_post_edit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Protected post fields cannot be changed';
  end if;

  if old.status in ('deleted', 'removed') then
    raise exception 'Unavailable posts cannot be modified';
  end if;

  if new.status in ('deleted', 'removed') then
    if new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.category is distinct from old.category
      or new.edited_at is distinct from old.edited_at
    then
      raise exception 'Removal can only change post status';
    end if;
  elsif new.status is distinct from 'published' then
    raise exception 'Invalid post status';
  end if;

  return new;
end;
$$;

create table public.user_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  suspended_by uuid not null references auth.users(id),
  suspended_at timestamptz not null default now(),
  suspended_until timestamptz,
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id),
  constraint suspension_end_after_start
    check (suspended_until is null or suspended_until > suspended_at),
  constraint suspension_lift_pair
    check ((lifted_at is null) = (lifted_by is null))
);

alter table public.user_suspensions enable row level security;
revoke all on table public.user_suspensions from anon, authenticated;
grant select on table public.user_suspensions to authenticated;

create policy "Administrators can read suspensions"
on public.user_suspensions
for select
to authenticated
using (public.current_user_role() = 'administrator');

create or replace function public.is_current_user_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_suspensions
    where user_id = auth.uid()
      and lifted_at is null
      and (suspended_until is null or suspended_until > now())
  );
$$;

revoke all on function public.is_current_user_suspended() from public, anon;
grant execute on function public.is_current_user_suspended() to authenticated;

create or replace function public.current_suspension()
returns table (reason text, suspended_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.reason, s.suspended_until
  from public.user_suspensions s
  where s.user_id = auth.uid()
    and s.lifted_at is null
    and (s.suspended_until is null or s.suspended_until > now())
  limit 1;
$$;

revoke all on function public.current_suspension() from public, anon;
grant execute on function public.current_suspension() to authenticated;

-- Reapply write policies with a live database suspension check. This blocks
-- already-open sessions as well as newly signed-in accounts.
drop policy if exists "Students can create their own posts" on public.posts;
create policy "Students can create their own posts"
on public.posts
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'published'
  and edited_at is null
  and not public.is_current_user_suspended()
);

drop policy if exists "Authors can update their own published posts"
on public.posts;
create policy "Authors can update their own published posts"
on public.posts
for update
to authenticated
using (
  author_id = (select auth.uid())
  and status = 'published'
  and not public.is_current_user_suspended()
)
with check (
  author_id = (select auth.uid())
  and status in ('published', 'deleted')
  and not public.is_current_user_suspended()
);

drop policy if exists "Students can comment on published posts as themselves"
on public.post_comments;
create policy "Students can comment on published posts as themselves"
on public.post_comments
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'published'
  and not public.is_current_user_suspended()
  and exists (
    select 1
    from public.posts
    where posts.id = post_comments.post_id
      and posts.status = 'published'
  )
);

drop policy if exists "Students can upvote published posts"
on public.post_upvotes;
create policy "Students can upvote published posts"
on public.post_upvotes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and not public.is_current_user_suspended()
  and exists (
    select 1
    from public.posts
    where posts.id = post_upvotes.post_id
      and posts.status = 'published'
  )
);

drop policy if exists "Students can remove their own upvotes"
on public.post_upvotes;
create policy "Students can remove their own upvotes"
on public.post_upvotes
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and not public.is_current_user_suspended()
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  reason text not null
    check (reason in ('spam', 'harassment', 'offensive', 'misleading', 'other')),
  details text check (details is null or char_length(trim(details)) between 1 and 1000),
  status text not null default 'open'
    check (status in ('open', 'removed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_reason text,
  constraint content_reports_one_target
    check ((post_id is null) <> (comment_id is null)),
  constraint content_reports_resolution_pair
    check (
      (status = 'open' and resolved_at is null and resolved_by is null)
      or
      (status <> 'open' and resolved_at is not null and resolved_by is not null)
    )
);

create unique index content_reports_reporter_post_unique
on public.content_reports (reporter_id, post_id)
where post_id is not null;

create unique index content_reports_reporter_comment_unique
on public.content_reports (reporter_id, comment_id)
where comment_id is not null;

create index content_reports_open_created_idx
on public.content_reports (created_at, id)
where status = 'open';

alter table public.content_reports enable row level security;
revoke all on table public.content_reports from anon, authenticated;
grant select, insert on table public.content_reports to authenticated;

create policy "Moderators can read reports"
on public.content_reports
for select
to authenticated
using (public.current_user_role() in ('moderator', 'administrator'));

create policy "Students can report visible content once"
on public.content_reports
for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and status = 'open'
  and resolved_at is null
  and resolved_by is null
  and not public.is_current_user_suspended()
  and (
    (
      post_id is not null
      and exists (
        select 1 from public.posts
        where posts.id = content_reports.post_id
          and posts.status = 'published'
      )
    )
    or
    (
      comment_id is not null
      and exists (
        select 1
        from public.post_comments c
        join public.posts p on p.id = c.post_id
        where c.id = content_reports.comment_id
          and c.status = 'published'
          and p.status = 'published'
      )
    )
  )
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null check (char_length(trim(action)) between 3 and 100),
  target_type text not null check (char_length(trim(target_type)) between 3 and 50),
  target_id uuid,
  reason text check (reason is null or char_length(trim(reason)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc, id desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;

create policy "Administrators can read audit log"
on public.audit_log
for select
to authenticated
using (public.current_user_role() = 'administrator');

-- Internal append-only writer. Clients have no execute grant; privileged RPCs
-- call it while preserving auth.uid() as the audited actor.
create or replace function public.write_audit_log(
  event_action text,
  event_target_type text,
  event_target_id uuid,
  event_reason text default null,
  event_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.current_user_role()::text, '') not in ('moderator', 'administrator') then
    raise exception 'Moderator role required' using errcode = '42501';
  end if;

  insert into public.audit_log (
    actor_id, action, target_type, target_id, reason, metadata
  ) values (
    auth.uid(),
    trim(event_action),
    trim(event_target_type),
    event_target_id,
    nullif(trim(event_reason), ''),
    coalesce(event_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.write_audit_log(text, text, uuid, text, jsonb)
from public, anon, authenticated;

create or replace function public.moderation_queue()
returns table (
  target_type text,
  target_id uuid,
  post_id uuid,
  author_id uuid,
  report_count bigint,
  reasons text[],
  preview text,
  oldest_reported_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_user_role()::text, '') not in ('moderator', 'administrator') then
    raise exception 'Moderator role required' using errcode = '42501';
  end if;

  return query
  select q.*
  from (
    select
      'post'::text as target_type,
      p.id as target_id,
      p.id as post_id,
      p.author_id,
      count(r.id) as report_count,
      array_agg(distinct r.reason order by r.reason) as reasons,
      left(p.title || E'\n' || p.body, 240) as preview,
      min(r.created_at) as oldest_reported_at
    from public.content_reports r
    join public.posts p on p.id = r.post_id
    where r.status = 'open' and r.post_id is not null
    group by p.id, p.author_id, p.title, p.body

    union all

    select
      'comment'::text as target_type,
      c.id as target_id,
      c.post_id,
      c.author_id,
      count(r.id) as report_count,
      array_agg(distinct r.reason order by r.reason) as reasons,
      left(c.body, 240) as preview,
      min(r.created_at) as oldest_reported_at
    from public.content_reports r
    join public.post_comments c on c.id = r.comment_id
    where r.status = 'open' and r.comment_id is not null
    group by c.id, c.author_id, c.body
  ) q
  order by q.oldest_reported_at asc, q.target_id;
end;
$$;

revoke all on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

create or replace function public.moderate_reported_content(
  report_target_type text,
  report_target_id uuid,
  decision text,
  decision_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_report_count integer;
begin
  if coalesce(public.current_user_role()::text, '') not in ('moderator', 'administrator') then
    raise exception 'Moderator role required' using errcode = '42501';
  end if;

  if report_target_type not in ('post', 'comment')
    or decision not in ('remove', 'dismiss')
    or char_length(trim(coalesce(decision_reason, ''))) not between 3 and 500
  then
    raise exception 'Invalid moderation decision' using errcode = '22023';
  end if;

  select count(*) into open_report_count
  from public.content_reports r
  where r.status = 'open'
    and (
      (report_target_type = 'post' and r.post_id = report_target_id)
      or
      (report_target_type = 'comment' and r.comment_id = report_target_id)
    );

  if open_report_count = 0 then
    raise exception 'No open reports found' using errcode = 'P0002';
  end if;

  if decision = 'remove' and report_target_type = 'post' then
    update public.posts
    set status = 'removed'
    where id = report_target_id and status = 'published';
  elsif decision = 'remove' then
    update public.post_comments
    set status = 'removed', removed_at = now()
    where id = report_target_id and status = 'published';
  end if;

  update public.content_reports r
  set status = case when decision = 'remove' then 'removed' else 'dismissed' end,
      resolved_at = now(),
      resolved_by = auth.uid(),
      resolution_reason = trim(decision_reason)
  where r.status = 'open'
    and (
      (report_target_type = 'post' and r.post_id = report_target_id)
      or
      (report_target_type = 'comment' and r.comment_id = report_target_id)
    );

  perform public.write_audit_log(
    case when decision = 'remove' then 'content.removed' else 'reports.dismissed' end,
    report_target_type,
    report_target_id,
    trim(decision_reason),
    jsonb_build_object('closed_report_count', open_report_count)
  );
end;
$$;

revoke all on function public.moderate_reported_content(text, uuid, text, text)
from public, anon;
grant execute on function public.moderate_reported_content(text, uuid, text, text)
to authenticated;

create or replace function public.admin_set_suspension(
  target_user_id uuid,
  suspension_reason text,
  suspension_until timestamptz default null
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

  if target_user_id = auth.uid() then
    raise exception 'Administrators cannot suspend themselves' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(suspension_reason, ''))) not between 3 and 500
    or (suspension_until is not null and suspension_until <= now())
  then
    raise exception 'Invalid suspension' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.user_suspensions (
    user_id, reason, suspended_by, suspended_at, suspended_until,
    lifted_at, lifted_by
  ) values (
    target_user_id, trim(suspension_reason), auth.uid(), now(),
    suspension_until, null, null
  )
  on conflict (user_id) do update
  set reason = excluded.reason,
      suspended_by = excluded.suspended_by,
      suspended_at = excluded.suspended_at,
      suspended_until = excluded.suspended_until,
      lifted_at = null,
      lifted_by = null;

  perform public.write_audit_log(
    'account.suspended',
    'user',
    target_user_id,
    trim(suspension_reason),
    jsonb_build_object('suspended_until', suspension_until)
  );
end;
$$;

revoke all on function public.admin_set_suspension(uuid, text, timestamptz)
from public, anon;
grant execute on function public.admin_set_suspension(uuid, text, timestamptz)
to authenticated;

create or replace function public.admin_lift_suspension(
  target_user_id uuid,
  lift_reason text
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

  if char_length(trim(coalesce(lift_reason, ''))) not between 3 and 500 then
    raise exception 'Invalid lift reason' using errcode = '22023';
  end if;

  update public.user_suspensions
  set lifted_at = now(), lifted_by = auth.uid()
  where user_id = target_user_id
    and lifted_at is null
    and (suspended_until is null or suspended_until > now());

  if not found then
    raise exception 'Active suspension not found' using errcode = 'P0002';
  end if;

  perform public.write_audit_log(
    'account.suspension_lifted',
    'user',
    target_user_id,
    trim(lift_reason),
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.admin_lift_suspension(uuid, text)
from public, anon;
grant execute on function public.admin_lift_suspension(uuid, text)
to authenticated;

create or replace function public.admin_list_accounts(search_term text default null)
returns table (
  user_id uuid,
  email text,
  role public.app_role,
  suspended boolean,
  suspension_reason text,
  suspended_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'administrator' then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    r.role,
    coalesce(
      s.lifted_at is null
      and (s.suspended_until is null or s.suspended_until > now()),
      false
    ),
    case
      when s.lifted_at is null
        and (s.suspended_until is null or s.suspended_until > now())
      then s.reason
    end,
    case
      when s.lifted_at is null
        and (s.suspended_until is null or s.suspended_until > now())
      then s.suspended_until
    end
  from auth.users u
  join public.user_roles r on r.user_id = u.id
  left join public.user_suspensions s on s.user_id = u.id
  where search_term is null
     or trim(search_term) = ''
     or u.email ilike '%' || trim(search_term) || '%'
  order by u.email;
end;
$$;

revoke all on function public.admin_list_accounts(text) from public, anon;
grant execute on function public.admin_list_accounts(text) to authenticated;

create or replace function public.admin_list_audit_log(
  action_filter text default null,
  actor_filter text default null,
  row_limit integer default 100
)
returns table (
  id bigint,
  actor_id uuid,
  actor_email text,
  action text,
  target_type text,
  target_id uuid,
  reason text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'administrator' then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.actor_id,
    u.email::text,
    a.action,
    a.target_type,
    a.target_id,
    a.reason,
    a.metadata,
    a.created_at
  from public.audit_log a
  join auth.users u on u.id = a.actor_id
  where (action_filter is null or trim(action_filter) = '' or a.action = action_filter)
    and (
      actor_filter is null
      or trim(actor_filter) = ''
      or u.email ilike '%' || trim(actor_filter) || '%'
      or a.actor_id::text = trim(actor_filter)
    )
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(row_limit, 100), 250));
end;
$$;

revoke all on function public.admin_list_audit_log(text, text, integer)
from public, anon;
grant execute on function public.admin_list_audit_log(text, text, integer)
to authenticated;

-- Add role assignment to the append-only audit trail.
create or replace function public.admin_assign_role(
  target_user_id uuid,
  new_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role public.app_role;
begin
  if public.current_user_role() is distinct from 'administrator' then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  select role into previous_role
  from public.user_roles
  where user_id = target_user_id;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  update public.user_roles
  set role = new_role, updated_at = now()
  where user_id = target_user_id;

  if previous_role is distinct from new_role then
    perform public.write_audit_log(
      'role.assigned',
      'user',
      target_user_id,
      null,
      jsonb_build_object(
        'previous_role', previous_role::text,
        'new_role', new_role::text
      )
    );
  end if;
end;
$$;

revoke all on function public.admin_assign_role(uuid, public.app_role) from public;
grant execute on function public.admin_assign_role(uuid, public.app_role)
to authenticated;

commit;
