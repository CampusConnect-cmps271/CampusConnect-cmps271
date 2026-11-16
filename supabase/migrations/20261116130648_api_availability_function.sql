-- SP4-29 / SP4-30 (SCRUM-271, SCRUM-272): per-endpoint API availability.
--
-- The availability dashboard (/admin/availability) calls this function through
-- the server's secret-key client. It was created by hand on the hosted project
-- without a migration; this file records exactly that definition and grants, so
-- local databases, tests and any new project get it too. On hosted it is a
-- no-op (create or replace with the same body and grants).
--
-- It reads the api.request.completed rows that trackApiRequest writes to
-- app_logs. 5xx responses count as failures; 4xx responses are counted
-- separately and still count as available. hours_back is clamped to 1..720.
begin;

create or replace function public.get_api_availability(hours_back integer default 24)
returns table (
  endpoint text,
  method text,
  total_requests bigint,
  successful_requests bigint,
  client_errors bigint,
  server_errors bigint,
  availability_percent numeric
)
language sql
stable
set search_path = ''
as $$
  select
    l.context->>'endpoint' as endpoint,
    l.context->>'method' as method,
    count(*) as total_requests,
    count(*) filter (
      where (l.context->>'status')::integer < 400
    ) as successful_requests,
    count(*) filter (
      where (l.context->>'status')::integer between 400 and 499
    ) as client_errors,
    count(*) filter (
      where (l.context->>'status')::integer between 500 and 599
    ) as server_errors,
    round(
      100.0 * (
        count(*) - count(*) filter (
          where (l.context->>'status')::integer between 500 and 599
        )
      ) / nullif(count(*), 0),
      2
    ) as availability_percent
  from public.app_logs as l
  where l.event = 'api.request.completed'
    and l.source = 'server'
    and l.created_at >= now() - (
      greatest(1, least(hours_back, 720)) * interval '1 hour'
    )
    and l.context->>'status' ~ '^[1-5][0-9][0-9]$'
  group by l.context->>'endpoint', l.context->>'method'
  order by endpoint, method;
$$;

comment on function public.get_api_availability(integer) is
  'Per-endpoint request counts and availability (5xx = failure, 4xx counted separately) from api.request.completed app_logs rows in the last hours_back hours (1..720). Service role only.';

-- Supabase grants new functions to anon and authenticated by default. Only the
-- server's secret-key client calls this one, as on hosted.
revoke all on function public.get_api_availability(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_api_availability(integer) to service_role;

commit;
