-- SCRUM-90: central application log.
--
-- Both the server and the browser write here, always through the app's secret
-- key. The sprint plan said CloudWatch; the team moved to a Supabase table.
begin;

create table public.app_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  level text not null check (level in ('info', 'warn', 'error')),
  -- Where the entry came from. 'client' entries arrive through /api/log and
  -- are never more trusted than the browser that sent them.
  source text not null check (source in ('server', 'client')),
  -- Dotted event name, e.g. auth.login.failure. Query on this, not on message.
  event text not null,
  message text,
  -- Plain uuid, deliberately NOT a foreign key to auth.users.
  --
  -- Two reasons. The insert is deferred through after(), so an id read from a
  -- valid token can refer to a row deleted before the write lands; a foreign
  -- key turns that into a violation and the entry is lost. And `on delete set
  -- null` would strip attribution from every row of a deleted account, which
  -- is exactly what an audit trail must not do.
  user_id uuid,
  context jsonb not null default '{}'::jsonb
);

comment on table public.app_logs is
  'Central application log. Written only with the secret key; see modules/logging.';
comment on column public.app_logs.context is
  'Structured detail, already redacted. Must never hold passwords, tokens or message bodies.';

-- Reading logs means "recent entries" or "this event", so index both.
create index app_logs_created_at_idx on public.app_logs (created_at desc);
create index app_logs_event_idx on public.app_logs (event);

-- RLS on with no policies at all: anon and authenticated can do nothing here,
-- including read. The service role bypasses RLS, so only server code that
-- holds the secret key can write or read.
alter table public.app_logs enable row level security;

revoke all on public.app_logs from anon, authenticated;

-- Retention: drop anything older than 14 days, nightly at 03:00 UTC.
create extension if not exists pg_cron;

-- Scheduling by name is an upsert, so re-running this migration is safe.
select cron.schedule(
  'delete-old-app-logs',
  '0 3 * * *',
  $$delete from public.app_logs where created_at < now() - interval '14 days'$$
);

commit;
