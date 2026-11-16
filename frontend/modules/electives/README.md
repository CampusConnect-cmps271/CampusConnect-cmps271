# Elective preferences, recommendations and review evidence

Direct feature URLs (shared navigation remains owned by the navigation ticket):

- `/electives/preferences`: private, editable preferences.
- `/electives/recommendations`: authenticated catalogue recommendations and optional review evidence.
- `POST /api/electives/recommendations`: validated `ElectivePreferences` JSON, same-origin, no-store.
- `POST /api/electives/analysis`: `{ "course_id": "catalogue UUID" }`, same-origin, no-store.

Apply the additive `elective_preferences` migration before deploying these routes.
The optional semester preferences additionally require `resis_semester_catalogue`
and `elective_offering_preferences`. Existing preferences continue to work with
empty offering filters. The catalogue and published review tables are prerequisites.

## Where AI appears

The preference form saves inputs without calling a model. The catalogue
matcher selects complete comma-separated interest groups before any optional
provider call. Successful enrichment is labelled **AI-assisted explanations
for catalogue-matched courses** on the recommendations page.

**Explore review evidence** always makes published source excerpts and sample
counts available. When three-stage analysis succeeds, a separate **AI review
analysis** section identifies the defender's benefits, prosecutor's drawbacks,
and judge's balanced assessment. Every claim links to its cited source review;
interpretations should be checked against those quotations and limitations.
Sparse reviews, missing configuration and unverified provider output keep the
source evidence available without displaying a partial AI analysis.

## Provider configuration

The baseline works without any AI configuration. All credentials below stay
server-side and must never use the `NEXT_PUBLIC_` prefix. The provider is
selected with `ELECTIVES_PROVIDER`: `gemini` or `gateway`. An unset selector
preserves the existing gateway configuration; unknown selections disable AI.
Missing or invalid configuration leaves the catalogue baseline usable.

### Google Gemini

Create a key in [Google AI Studio](https://aistudio.google.com/api-keys), then
add these values to the frontend server's ignored `.env.local` file (or hosting
secret settings):

```dotenv
ELECTIVES_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-3.1-flash-lite
```

Restart the development server or redeploy after changing the environment.
The model can be changed to a supported text model available to your Google
project. The default is Google's stable [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite);
model availability and quota must be verified with your own key.

The app uses native server-side `fetch` against Google's fixed
`generativelanguage.googleapis.com` HTTPS host. The key is sent only in the
`x-goog-api-key` header. No SDK or third-party gateway is required. Requests use
Google's [structured JSON output format](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
with the same schemas used to validate the returned recommendations and
analysis. Only a single complete `STOP` candidate is accepted; blocked,
truncated, malformed, oversized or untraceable responses fall back safely.
Each call has a four-second timeout and a 4,096-output-token cap, with no retries.

### Existing JSON gateway

Set `ELECTIVES_PROVIDER=gateway`, `ELECTIVES_PROVIDER_URL` and
`ELECTIVES_PROVIDER_TOKEN` for a trusted HTTPS gateway implementing the contract
below. No production gateway or credentials are bundled. Gemini keys are never
used as gateway bearer tokens.

### Verifying a live connection

1. Set up Gemini or a compatible gateway as described above. Keep credentials
   in server-only local environment or hosting secret settings.
2. Confirm model access and quota in the selected provider's project. For a
   gateway, confirm its request and response contract before using real data.
3. Restart the development server, or redeploy after changing hosting settings.
4. With an authenticated student, request recommendations and check that the
   response reports `mode: "provider"` and `providerStatus: "available"`.
   Baseline results alone do not establish that the connection worked.
5. For a course with at least three published reviews, request analysis and
   confirm `analysis.status: "available"`, all three stages, and source links.
   Record provider/model, environment and the outcome without copying keys or
   private student data into reports.

Use synthetic preferences and review excerpts for the initial provider contract
check. A live student request sends the documented bounded input to the chosen
provider; enable it only with the intended provider and deployment settings.

Gateway requests contain `{ operation, input, instructions }` with bearer authentication.
Operations are `recommend`, `defender`, `prosecutor`, `judge`.

- `recommend`: `input` contains bounded preferences and up to twenty catalogue
  candidates. Return `{ "items": [{ "course_id": "supplied ID", "rationale":
  "explanation", "evidence_review_ids": [] }] }`. Identifiers must be unique,
  refer to the supplied candidates, and cannot override catalogue facts or
  prerequisite status. Review citations belong to the separate evidence analysis.
- Each analysis stage receives published review excerpts, sample metadata, a
  perspective and a response schema. The judge also receives validated earlier
  stages. Return `{ "summary": "...", "uncertainty": "...", "claims": [
  { "review_id": "supplied ID", "quote": "exact source substring",
  "observation": "..." }] }`. Every citation and quote is checked. Student IDs
  and private profiles are never included. Interpretations remain model output;
  quote verification does not establish their correctness.

Calls time out after four seconds, prohibit redirects, and accept at most 32 KB
of JSON output. There is at most one recommendation call or three sequential
analysis calls per request. Configure provider quotas and deployment rate
limits before enabling AI in production. Provider failures leave the catalogue
baseline and source evidence usable. Tests inject deterministic providers;
fixtures are never enabled as a production substitute.

Catalogue candidates are filtered in the database by semester, one-section constraints and a conservative interest prefilter. Ratings come back in the same RPC. Exact Unicode interest matching and ranking remain in application code. Pagination covers every matching candidate with no 5,000-record cutoff; the displayed catalogue count retains the full semester/section scope independently of interests. Up to twenty exact interest matches are shown.

Candidate data is cached for 30 seconds per verified student/project/query, with bounded memory, optional shared Upstash Redis and concurrent-read coalescing. Profiles, AI responses and final recommendations are not cached; responses remain private/no-store. The already verified request user is reused for catalogue/profile lookups. Server-Timing exposes numeric stage timings and catalogue request/byte/cache metrics without private inputs. See [PERFORMANCE.md](./PERFORMANCE.md) for measurements, limitations and the offline benchmark.

The browser allows thirty seconds for the full database-and-provider request; each provider call still has a four-second limit.
The authenticated profile supplies the student's major. Computer Science
students see an approval/petition check on EECE courses, and an elective-credit
check on other departments. These notices are advisory, not a blanket claim
that every cross-department course requires a petition. Explicit catalogue
exclusions for Computer Science are preserved and demoted in ranking. Missing
or unavailable profile data is disclosed rather than defaulting a student to CS.
Provider output cannot override these registration checks, and partial provider
output is filled from the catalogue baseline to retain up to twenty results.
Reviews use the latest 24 published records, with
up to 1,500 characters per excerpt and a full sample-size count. Averages with
fewer than three reviews are not used for workload fit; unavailable rating data
keeps counts and workload fit unknown. Prerequisite prose and
ambiguous AND/OR rules remain visible and marked unknown. Self-reported
completion is not verified eligibility.

## Optional Upstash Redis cache

The server checks its in-memory cache first, then Upstash Redis, then the
student-authenticated Supabase RPC. Redis shares candidate facts across server
instances; Supabase remains the source of truth. Authentication is checked on
every request, and ranking still uses current preferences and profile data.

Create a free Upstash Redis database in the same region as the deployed functions
(`frontend/vercel.json` currently selects `hnd1`, Tokyo). Put the REST credentials
in ignored `frontend/.env.local` for local use, or the hosting project's server
secret settings for Preview/Production:

```dotenv
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-server-only-token
```

Never prefix these names with `NEXT_PUBLIC_`. Restart or redeploy after changing
them. Missing configuration uses the memory/Supabase path automatically. Vercel
production, preview and local namespaces are separated; use the optional
`UPSTASH_REDIS_CACHE_NAMESPACE` to separate additional projects or preview branches.

Redis entries expire within the original 30-second freshness window; a hit never
extends that window. Memory retains at most 64 entries / 8 MiB of serialized JSON;
shared entries over 256 KiB are skipped. Keys hash the Supabase project, verified
student and normalized candidate query. Values contain catalogue facts and
published rating aggregates, without student profiles, saved preferences, AI
responses or final recommendations. Cached payloads are validated before use.

Redis GET has no retries and a 200 ms command timeout on Vercel (1,500 ms locally).
An error bypasses Redis for 30 seconds in that server instance and continues with
Supabase. `UPSTASH_REDIS_TIMEOUT_MS` can override the deadline between 50 and 2,000
ms. Redis writes run with Next.js `after()` so they do not delay the response;
a write failure cannot invalidate a successful database result. A second instance
may still query Supabase before that background write completes.

`Server-Timing` includes `redis` and `catalogue_tier` (`memory`, `redis`, or
`database`) alongside catalogue request counts. Ordinary unit/browser tests
never contact the configured real Redis. An explicit live smoke check uses one
unique synthetic entry with a 30-second TTL and deletes it afterward:

```sh
UPSTASH_LIVE_VERIFY=1 npm run verify:redis
```

That check reads `.env.local`, verifies reuse by two independent cache instances,
and saves credential-free results to `/tmp/upstash-live-results.json`. It never
calls Supabase, Resis or an AI provider. See [PERFORMANCE.md](./PERFORMANCE.md) for
the measured local latency and its limitations.

## Matching comma-separated preferences

Each comma-separated interest is one group. All words within a group must
appear as whole words in the course name, department or description. At least
one whole interest group must match for a course to be recommended: `software
security, cryptography` means `(software AND security) OR cryptography`.
The words need not be adjacent. Matching normalizes case and Unicode and
handles punctuation; it does not infer synonyms or semantic similarity.

Academic goals are also grouped by commas. A complete matching goal adds a
ranking bonus; a partial goal match does not. Goals adjust the order of
interest-matching courses rather than acting as another required filter.
Each distinct complete interest contributes five points and each complete
goal contributes one point. Workload, ratings, prerequisite penalties and
major-specific registration guidance continue to apply. Duplicate groups do
not earn extra points. Provider enrichment only receives the matching shortlist.

Saved multiword interests already retain their comma boundaries, so existing
preferences use this behavior without a storage migration or being resaved.
Fewer than twenty courses, or an empty result, is expected when fewer complete
matches exist. Do not add unrelated courses to reach twenty.

## Development workflow

Start follow-up work from current `main` and use a separate branch for each
Jira task. The questionnaire, recommendation and evidence implementations are
already integrated; the historical stacked `scrum-212` through `scrum-220`
branches are not additional changes that must be merged again. Provider
configuration and live integration verification remain separate release work.

## Validation

From `frontend/`: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`, and `npm run test:e2e`. Elective unit/API tests live in this
module; the PGlite migration/RLS test is `tests/elective-preferences.test.mjs`.
Browser fixtures and accounts are isolated in `tests/e2e/mock-electives.mjs`.
Use `PLAYWRIGHT_CHANNEL=chrome` for an installed Chrome browser.

Before release, review migration order against the then-current main/hosted
schema, run the real configured provider integration, and follow the repository
rule to apply reviewed migrations before merging. No hosted changes are made
by these tests.

## Semester and section preferences

The private `offering_preferences` JSON stores an optional imported semester,
up to ten instructors (match any), up to ten attributes (match all), allowed
meeting days, and an earliest start/latest end window. These fields are optional;
leaving the semester unset preserves the all-catalogue recommendation flow.
Clearing the semester clears its section filters on save. Suggestions are derived
from the active imported semester data in Supabase, with pagination past 1,000 rows.

A match requires one section to satisfy every selected requirement together.
Every listed lecture/lab meeting must satisfy the day and time filters; unknown
meeting data cannot pass a filter that needs it. Time comparisons use the original
AUB SIS HH:mm strings without applying the browser's timezone. Matching sections,
instructors, attributes, meeting times and registration rules appear in results,
and course links preserve the selected semester. Catalogue grade prerequisites
remain intact; section rules do not establish registration eligibility or resolve
conflicts between different recommended courses.

These paths never import the Resis client and never call its API. They read active
saved `course_semester_catalogue` snapshots. The optional AI provider receives a
bounded candidate summary rather than complete section datasets, and cannot
introduce a course excluded by the deterministic section filters.

Storage remains protected by the existing owner RLS policies. The additive
migration validates JSON keys, semester availability, array bounds, days and
HH:mm windows on direct database writes as well as through form/API validation.
The applied migration version is `20261109093451`. No existing student preferences
were changed. The Supabase security advisor reported no findings for the new
validation function or preference field.

## Browse by semester and attribute

Leave interests and academic goals blank and choose an imported semester to
browse every matching course, including completed courses. For example, select
Spring and the exact suggested attribute **Cultures and Histories**. Browse mode
has no 20-course cutoff and never calls AI; the page reveals 24 cards at a time
from the full filtered result. Interest-based recommendations still require a
complete interest group and show up to 20 results. Punctuation-only interests
are normalized to empty; without a semester, at least one real interest is required.
Goals are optional ranking bonuses, not browse requirements.

Cards include full catalogue descriptions, advisory prerequisites and the saved
section prerequisite/co-requisite prose where supplied. The source does not
provide a separate structured co-requisite field; do not infer eligibility or
invent missing requirements. Each section shows actual meeting duration,
instructor, attributes and CRN. MWF/TR/MW shortcuts select allowed days; they do
not assert an exact meeting pattern or imply a fixed class duration. Every
listed meeting must still satisfy all selected day/time constraints.

The importer preserves explicit Resis `connected` CRNs and derives component
labels from their saved section/meeting types. E1 is never assumed to mean lab:
it can be a recitation or another listed type. Connected CRNs and labels remain
visible even if their component is outside the selected day/time window. Links
are advisory source connections; verify the required registration combination
in AUB SIS. Existing snapshots were enriched from saved responses only, guarded
by semester/fetch time; no Resis calls or active snapshot replacements were needed.

Applied migrations: `20261114142822_elective_attribute_browse.sql`,
`20261114142833_resis_connected_crns.sql`, and
`20261114143203_resis_connected_labels.sql`. Owner RLS and existing validation
triggers remain in force. Local regression tests cover empty preferences, all
53 synthetic matches, Redis preservation, connection labels and stale-fetch
protection. A hosted authenticated-role RPC returned all 133 Spring courses with
Cultures and Histories; this is the saved snapshot, not current SIS availability.
