# Shared course catalogue cache

Normal catalogue browsing now reuses a server-side Next.js Data Cache entry
instead of repeating the course bundle RPC for every visitor. This uses the
existing Next.js deployment; it introduces no Redis service or package.

## Access and scope

`getCourseCatalogue()` and the cache entry point authenticate before every read,
including hits. The HTML response stays private and uncached. Cache keys contain
the Supabase project URL and canonical course filters, never cookies, tokens or
user identities. Only basic catalogue browsing uses this path; semester and
rating-filter queries retain the existing caller-scoped queries.

The cached projection contains course reference fields, department labels,
active imported semester labels, and numeric aggregates of **published** reviews.
These fields have the same visibility for all authenticated students under the
current policies. It contains no profiles, personal reviews, messages, notification
counts, plans or saved selections. Schema validation strips unknown fields before
storage, and results are cloned before presentation.

The server uses its existing secret-key client to call
`read_shared_course_catalogue`. This RPC is SECURITY INVOKER with an empty search
path, and is executable only by `service_role`. Because that role bypasses RLS,
the RPC explicitly filters out inactive/unfinished semester imports. Its rating
source already explicitly excludes removed reviews. Anonymous and authenticated
API clients cannot invoke the shared source. The original authenticated RPC and
its RLS behavior remain available for fallback.

This is a shared-data contract, not a generic privileged-query cache. Before
introducing per-student course visibility or personalized rating aggregates,
disable this cache and change its audience/key/projection; invalidate existing
entries before applying the visibility change.

## Freshness and failures

- Revalidate after 60 seconds. Next.js may serve the previous healthy entry while
  refreshing it. Entries older than 120 seconds fall back to a live caller read.
- Successful review saves, edits, deletes and review moderation call `updateTag`
  so the next catalogue read waits for fresh data. Failed writes do not invalidate.
- Imports performed by the CLI become visible through time revalidation; there
  is no new public invalidation endpoint.
- Coalesce simultaneous same-key misses within a server process. The managed
  Data Cache shares completed entries across requests; there is no claim of a
  distributed lock or one cold fetch across every Vercel instance.
- Do not store malformed responses, RPC errors or incomplete rating bundles.
  Shared-source failure uses a ten-second backoff, logs once per failure window,
  and falls back to the existing caller-scoped read.
- `COURSE_CATALOGUE_CACHE_ENABLED=false` disables the shared cache immediately
  for that deployment. Missing server credentials also use the existing path.

## Rollout and verification

Apply `20261127074219_cache_shared_course_catalogue.sql` before deploying the
frontend. The migration adds the service-only projection and the execute grants
needed for its nested read-only functions. It does not broaden anonymous or
authenticated table/RPC access.

Unit checks cover cross-student reuse, authentication on warm hits, concurrent
misses, filter/project separation, mutation isolation, invalidation and failure
fallback. Database checks cover RPC grants and active semester filtering. The
dedicated Playwright config tests real Next.js cross-request caching and review
invalidation against synthetic fixtures. Existing per-account failure fixtures
run with the shared cache disabled.

After deployment, repeat the hosted 50- and 100-client load stages. Local cache
hit counts establish avoided course reads, not a hosted capacity increase or
support for 200 concurrent full browser users.
