# Batched log persistence

Under the deployed 100-client diagnostic stage, app-log gateway writes had p95 2.89 seconds and max 4.45 seconds, while live-session calls also stalled. This does not prove logging caused the backend slowdown. This change limits logging's competing write requests without sampling away API availability records or security events. Production capacity must be measured again after deployment. During the failed stage, stored records included 193 API completion metrics and 105 slow-database warnings, so extra anomaly writes coincided with the backend pressure. This is evidence for controlling log traffic, not proof that it caused the initial stall.

`log.info/warn/error` still print each redacted event immediately, then use Next `after()` for persistence. Outside a request scope they await persistence, as before. Routine rows keep the emission timestamp instead of assigning the later batch-flush time. Existing availability queries continue to count individual rows.

Each Node process shares two writers across instrumentation/page bundles:

| Writer | Rows per batch | Queued rows | HTTP timeout | Concurrent app_logs inserts |
|---|---:|---:|---:|---:|
| Routine logs | 25 | 100 | 10 seconds | 1 |
| Optional course diagnostics | 10 | 16 | 1 second | 1 |

Batches are also limited to 128 KB of serialized JSON. A single oversized row is tried alone, preserving its previous behavior without combining it with other rows. Queue limits count waiting rows, excluding the active batch and caller-owned rows waiting for admission. They are backpressure, not a silent-drop policy or a bound on all application memory.

There is no flush timer: same-turn emissions share the first batch, and entries arriving during a write share later batches. Sparse traffic may still need one insert per row. On a slow backend, serialization prevents unbounded parallel app-log inserts from this process. Multiple server processes each have their own limits; this is not a project-wide connection limit.

Every valid row remains a separate record, with the same event, level, source, user attribution and redacted context. Alerts remain per entry after successful persistence; alert delivery does not hold the batch writer. Diagnostics use their existing numeric/ID whitelist and a separate queue so their shorter timeout cannot abort routine/security rows. The generic redactor is deliberately not applied to diagnostic phase names, which would redact numeric `live_session` timing.

Transient failures/timeouts are not retried because the insert might already have committed, and retrying would duplicate availability records. Explicit atomic PostgreSQL input/constraint errors (22P02, 22001, 23502, 23514) are isolated into single-row attempts so a malformed row does not discard its valid neighbors. Failed routine rows produce the existing console failure event; optional diagnostics remain best effort. Backend outages or function termination can still lose logs, as before. Queue waiting can exceed one HTTP timeout and the platform's lifecycle limit remains authoritative.

Set `LOG_BATCHING_ENABLED=false` for a controlled direct-write comparison or rollback of grouping/concurrency control. HTTP timeouts and emission timestamps remain in effect. `COURSE_TRACE_PERSIST_ENABLED=false` disables only optional diagnostic database writes; diagnostic console summaries remain. No table, RLS, grant, authentication or migration changes are required.

Validation includes a real-SDK/local-HTTP fixture: 100 routine rows persist as four requests with one insert in flight, compared with 100 direct requests. This is an implementation test, not a production throughput or latency claim. Additional tests cover full-queue backpressure, separate diagnostic deadlines, redaction, timestamp preservation, alert behavior, atomic data-error isolation and non-retry of ambiguous failures.
