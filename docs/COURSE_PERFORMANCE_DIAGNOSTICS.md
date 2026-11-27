# Course request diagnostics

The course page now records sampled timing summaries so a slow HTTP result can be compared with server work before another optimization is chosen. This change does not establish a higher user capacity.

On Vercel, diagnostics default to a 10% trace sample, capped at 30 records per minute per process, with at most 128 active request summaries and 16 pending database writes. `COURSE_TRACING_ENABLED=false` disables registration and correlation IDs. Locally it is off unless explicitly set to `true`. `COURSE_TRACE_SAMPLE_RATE` accepts a number greater than zero and at most one; invalid values fall back to 0.1. `COURSE_TRACE_PERSIST_ENABLED=false` keeps console records but disables database persistence.

Each sampled `/courses` Next request produces `performance.course_request` with a random proxy-generated request ID, timings for authentication, live-session lookup, catalogue loading/cache/RPC, ratings fallback and available framework spans. Responses carry `x-cc-request-id`; the JMeter plan retains only that UUID in `course_request_id`, with response/request headers and bodies excluded from its CSV. Incoming IDs are replaced. No account IDs, tokens, cookies, queries, arbitrary span attributes, errors or message text enter these summaries.

The explicit OpenTelemetry processor list has no automatic exporter and no fetch instrumentation. There is no external tracing collector. Sanitized sampled records go to the existing server-only `app_logs` table using the existing admin client, after the root span ends, with a one-second HTTP abort bound. Diagnostic inserts now share a per-process batch writer (10 rows, 128 KB per batch; 16 queued rows), separate from routine logs. Queue admission/waiting can take longer than one HTTP attempt; the SDK flush deadline and function lifetime still limit best-effort delivery. Failures are ignored. This adds bounded diagnostic work and storage; it is not zero overhead. Normal log retention applies. Disable persistence or tracing after collecting sufficient evidence.

Interpretation:

- `next_request_ms` covers the Next request handler span. It excludes transport to the edge and platform work before Next starts; it is not a guaranteed client last-byte measurement.
- Phases overlap and can nest. Do not add their totals to estimate total response time. Framework spans describe server work, not browser rendering.
- RSS and heap describe the application process, not database memory. CPU cores and event-loop utilization describe the interval between emitted records, potentially spanning several requests; they are not per-request CPU or a platform throttling signal. Compare records using `instance_id`.
- Missing records can be sampling, rate limiting, dropped writes, process termination, or unavailable framework spans. Absence does not prove a request was fast.

Inspect recent records through authorized SQL access:

```sql
select created_at, context
from public.app_logs
where event = 'performance.course_request'
order by created_at desc
limit 100;
```

Join `context->>'request_id'` to the JMeter CSV's `course_request_id`. Compare JMeter elapsed/Latency/Connect with Next duration and phases, commit, region and process metrics. A larger client duration alone does not identify which network or platform segment is responsible.

## Repeating the bounded remote comparison

`.github/workflows/load-diagnostics.yml` is manual only. It runs one five-minute stage at 5 or 25 distinct confirmed synthetic accounts, with 3–7 second reading pauses, matching the local workload. It verifies the current successful production main deployment, validates responses, and stops for sustained excessive latency or errors. The job can succeed while `summary.json.passed_all_gates` is false: execution success and performance acceptance are separate.

Supply the temporary repository Actions secret `SCRUM309_DIAGNOSTIC_ACCESS` containing the dedicated accounts, Supabase URL and publishable key; never a service key. Remove it after the run. The job removes generated private sessions and uploads only allowlisted measurements/dashboard files for three days. Do not commit credentials or sessions. Use standard public-repository GitHub runners; no paid service is configured.

Run local and remote stages sequentially against the same deployed commit. A different network also changes routing, and sequential tests happen at different times. A difference is diagnostic evidence, not a controlled proof of a code regression or interchangeable capacity estimates. The workload excludes browser assets/rendering, writes, AI and realtime; virtual users with reading pauses are not simultaneous in-flight requests.
