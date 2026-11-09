-- SCRUM-264..269: protect and retain logs, then support health monitoring.
begin;

-- app_logs used to be reachable only through the service-role client. Give
-- authenticated users SELECT permission at the grant layer, then let RLS make
-- the actual administrator decision. Inserts, updates and deletes remain
-- unavailable to every browser session.
grant select on table public.app_logs to authenticated;

drop policy if exists "Administrators can read application logs"
on public.app_logs;

create policy "Administrators can read application logs"
on public.app_logs
for select
to authenticated
using (public.current_user_role() = 'administrator');

comment on policy "Administrators can read application logs"
on public.app_logs is
  'Application logs contain operational metadata and are visible only to administrators.';

-- One retention function covers every application-owned log table. It is
-- deliberately SECURITY INVOKER: pg_cron runs it as the migration owner, and
-- service_role may run it manually, while no browser role can execute it.
create or replace function public.prune_monitoring_logs(
  reference_time timestamptz default now()
)
returns table (
  app_logs_deleted bigint,
  audit_logs_deleted bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  app_count bigint;
  audit_count bigint;
begin
  delete from public.app_logs
  where created_at < reference_time - interval '14 days';
  get diagnostics app_count = row_count;

  -- Audit history is more valuable for investigations, so retain it for one
  -- year while still applying a finite privacy-conscious retention window.
  delete from public.audit_log
  where created_at < reference_time - interval '365 days';
  get diagnostics audit_count = row_count;

  return query select app_count, audit_count;
end;
$$;

comment on function public.prune_monitoring_logs(timestamptz) is
  'Deletes application logs older than 14 days and audit logs older than 365 days.';

revoke all on function public.prune_monitoring_logs(timestamptz)
from public, anon, authenticated;
grant execute on function public.prune_monitoring_logs(timestamptz)
to service_role;

commit;

-- Hosted scheduling. Supabase Cron is pg_cron underneath; jobs must be
-- changed through cron functions rather than direct writes to cron.job.
create extension if not exists pg_cron;

select cron.unschedule(jobid)
from cron.job
where jobname in ('delete-old-app-logs', 'prune-monitoring-logs');

select cron.schedule(
  'prune-monitoring-logs',
  '0 3 * * *',
  $$select * from public.prune_monitoring_logs()$$
);
