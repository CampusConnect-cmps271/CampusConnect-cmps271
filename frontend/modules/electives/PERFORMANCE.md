# Recommendation performance — SCRUM-278 / 279 / 280

Measured 12 November 2026 on `mohamad/scrum-279-recommendation-performance`.
Baseline: main commit `39b0ebb`, preserved in `tests/performance/baseline-catalogue.ts`.

## Findings and changes

The old loader fetched every accessible course page, including all semester section JSON, before interest matching, then requested rating batches separately. The endpoint also rechecked the same authenticated user inside the catalogue and profile helpers. The optimized path reuses the already verified request user and calls an authenticated, security-invoker RPC for filtered candidates plus ratings. It retains the full semester/section scope count independently of interest filtering.

The database applies section constraints to one section at a time. Every meeting must fit selected days and time limits. Exact Unicode whole-token interest matching and prerequisite-aware ranking remain in application code. The SQL interest filter only applies necessary ASCII substring checks; non-ASCII terms and long corpora bypass that coarse filter to prevent locale or truncation differences from dropping candidates. It never limits candidates to twenty before ranking; pagination still covers more than 5,000 matches.

Intermediate SQL rows contain narrow metadata/search text; rich course and section fields are joined after filtering/pagination. This removed a measured temporary-file spill. JIT is disabled for this function only because its compilation overhead dominated the bounded query. The underlying table indexes already support the joins; no speculative index was added.

The process-local cache lasts 30 seconds, holds at most 64 entries / 8 MiB of serialized candidate JSON, coalesces identical concurrent reads and never retains failed loads. Keys hash the project, verified student ID and candidate query. Auth is checked before cache use. Profiles, AI responses, saved preferences and rendered recommendations are not cached. Fresh ranking still applies current workload/goals/completed-course inputs. Course and rating changes can take up to 30 seconds to appear; cache state is local to each server instance and is lost on restart. POST responses remain `private, no-store`.

## Controlled replay results

Five samples per row/mode, using 3,380 exported course records, their published rating aggregates and the saved Fall/Spring snapshots (6,778 sections total). Each database request adds a fixed **75 ms simulated transport delay** on top of actual local PGlite query time. Figures below cover **candidate loading plus ranking**, not full user-perceived response time. They exclude authentication, profile loading, Next proxy, browser rendering and optional AI. Bytes are JSON response payloads, not compressed wire bytes. Warm means the same student/query within the cache TTL.

| Scenario | Before median / p95 ms | Cold median / p95 ms | Warm median / p95 ms | Catalogue DB requests before → cold → warm | JSON bytes before → cold → warm |
| --- | ---: | ---: | ---: | --- | --- |
| All courses | 702.8 / 714.5 | 277.0 / 284.1 | 2.5 / 4.3 | 5 → 1 → 0 | 1,959,406 → 9,943 → 0 |
| Spring semester | 439.5 / 490.1 | 176.6 / 181.7 | 2.3 / 2.9 | 3 → 1 → 0 | 3,184,950 → 8,558 → 0 |
| Spring schedule | 415.6 / 447.1 | 362.5 / 400.8 | 4.3 / 4.9 | 3 → 1 → 0 | 3,191,165 → 129,483 → 0 |
| No matches | 507.0 / 603.4 | 275.9 / 290.2 | 0.1 / 0.1 | 4 → 1 → 0 | 1,958,235 → 57 → 0 |

For the Spring-interest scenario, cold catalogue/ranking time fell from about 439 ms to 177 ms, and JSON payload fell by 99.7%. These controlled results are not a promise of a particular student's production latency. The saved raw results and fixture digest are in `tests/performance/results-2026-11-12.json`.

## Live database checks

The team Supabase database accepted both additive migrations, verified authenticated execution and denied anonymous execution. Both functions are security invoker with an empty search path. A signed-in-role query returned the expected Spring scope count (1,371) and nonempty relevant candidates. The security advisor reported no finding for the new functions. Existing unrelated advisor findings were not changed.

A direct hosted `EXPLAIN ANALYZE` of the final Spring RPC measured 119.1 ms with zero temporary blocks read/written. The initial wide RPC had measured 295.7 ms and spilled temporary data. For context, an old single unfiltered Spring page measured 11.3 ms; it does less work and is only one part of the old multi-request path, so it is not comparable to total recommendation latency. Hosted SQL timings are single observations, not production p95 measurements.

## Per-request measurements

`POST /api/electives/recommendations` now returns `Server-Timing` entries for auth, completed-course validation, semester validation (when used), catalogue, profile, catalogue query, ranking, optional provider, inclusive recommendation time and total handler time. Catalogue cache state, logical DB-request count and JSON bytes appear as numeric/enum descriptions. Parallel catalogue/profile and inclusive recommendation/ranking/provider durations overlap; do not sum them to estimate total time. Proxy/auth refresh and response transfer/rendering sit outside handler timing. No preference text, course descriptions, student identifiers or credentials enter the timing headers.

Inspect these headers in browser developer tools to measure the actual signed-in environment; this turn did not use a student's live sign-in credentials or claim an end-to-end production timing.

## Reproduce without Resis

Use a credential-free local JSON export with `courses` (id, code, name, description, department, prerequisites, credits) and `ratings` (published course_rating_averages rows), plus the two saved `frontend/.resis-cache/snapshot-202710.json` and `snapshot-202720.json` files. The export and raw semester files remain untracked. From frontend:

```sh
PERF_FIXTURE=/absolute/path/catalogue.json PERF_SAMPLES=5 PERF_LATENCY_MS=75 PERF_OUTPUT=/tmp/elective-performance.json npm run perf:electives
```

The runner uses the actual frozen/optimized loaders and actual SQL migration in local PGlite, verifies complete recommendation equivalence before accepting results, and never contacts Resis, Supabase or an AI provider. Set latency to 0 to isolate local query/CPU costs. Do not treat PGlite timings as native Postgres timings.

## Validation and rollout

- 1,074 full unit/integration tests passed, including 24 native SQL/JS matching, Unicode, caller-RLS and direct-argument checks.
- 552 database regression tests passed; four existing TODO cases remain.
- 11 browser checks passed (with the final preference/cache journey rerun after instrumentation polish) for preference save/reload, recommendation filters, private cache reuse, changed filters, failure/empty states and mobile/native forms.
- Types, lint and the webpack production build passed.
- Both hosted migrations are applied and local filenames match migration history: `20261112162408_elective_candidate_queries.sql` and `20261112162835_elective_candidate_query_cost.sql`.

Apply both migrations before deploying the new frontend on another environment. The RPC fails closed with the existing generic catalogue error if unavailable; it does not silently return unfiltered courses. Existing Resis quota accounting and its maintenance-only importer are unchanged; the ledger still contains only the original three requests. SCRUM-242 was already merged through PR #53 and closed before this work.

## Upstash extension — 14 November 2026

Added the official `@upstash/redis` REST SDK (pinned to 1.41.0) and a Free Tier
Tokyo database, matching the configured Vercel `hnd1` function region. Credentials
are configured in ignored local environment only; hosting Preview/Production
needs its own server-side environment values and redeployment before shared
Redis is active there. The SQL and deterministic ranking are unchanged.

The hierarchy is memory → shared Redis → authenticated Supabase. Memory retains
the original 64-entry / 8 MiB serialized cap. Redis stores entries up to 256 KiB,
with a 30-second TTL and validated, user/query-bound envelopes. An inherited
entry keeps its original expiry. Redis never caches profiles, saved preferences,
AI output or final recommendation results. Keys are hashed and namespaces separate
Vercel production, preview and local; an optional namespace separates additional
preview branches. Authentication still runs before any cache access.

A Redis command uses a fresh AbortSignal, no retries and a 200 ms timeout on
Vercel (1,500 ms locally; optional 50–2,000 ms override). Failures open a 30-second
per-instance circuit and fall back to Supabase. Redis writes run after the
response through Next.js `after()`, preserving the original expiry and avoiding
SET latency in the response. Another cold instance can miss before the write
completes; this is local coalescing plus shared reuse, not a distributed lock.

### Live cross-instance verification

The explicit smoke check used actual Upstash networking from this local machine
to Tokyo, one synthetic course, and a fake counted database loader. It made zero
Supabase, Resis or provider calls. It verified complete payload equality, exactly
one loader call, a memory hit, and a Redis hit in an independent cache instance.
The unique test key had 29,283 ms TTL remaining and was deleted in cleanup.

| Scenario | Observed candidate-load time | Loader calls | Tier |
| --- | ---: | ---: | --- |
| First instance, cold | 894.3 ms | 1 | Database (synthetic loader) |
| Same instance, repeated | 0.8 ms | 0 | Memory |
| Independent second instance | 378.8 ms | 0 | Redis |

The background SET took 462.0 ms, excluded from the cold response measurement.
These are single observations over a distant local network, not production p95
or evidence of lower end-to-end latency. The benefit established here is shared
candidate reuse without a second catalogue query; colocated production latency
must still be measured after hosting environment setup. The production timeout
bounds Redis delay before database fallback. Historical November 12 replay
figures above predate Redis and should not be presented as Redis measurements.

Raw credential-free results: `tests/performance/upstash-results-2026-11-14.json`.
Reproduce with `UPSTASH_LIVE_VERIFY=1 npm run verify:redis`; ordinary test suites
use isolated cache doubles and cannot contact this database.

### Extension validation

- 1,091 full unit/integration tests passed, including shared-instance reuse,
  authentication/key isolation, corrupt payloads, TTL inheritance, delayed writes,
  oversize payloads and read/write outage fallback.
- 552 database regression tests passed; four pre-existing TODO cases remain.
- All 11 elective browser checks passed with real Redis explicitly disabled.
- Type checking, lint and the webpack production build passed.
- The live Upstash smoke check passed and removed its disposable record.
- Local production preview returns the expected signed-out redirect. Resis usage
  is unchanged: three original ledger attempts, zero new requests.
