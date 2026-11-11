# Resis semester courses — SCRUM-242

Campus Connect reads saved Supabase data. Visiting courses, reviews, the planner,
or recommendations never sends a request to Resis. Credit Resis wherever its
semester data is displayed. The key belongs only in `frontend/.env.local`:

```dotenv
RESIS_API_KEY=
```

The provider granted 5 requests/minute and 500/day. The maintenance client uses
**21 seconds between requests and at most 40 attempts per rolling 24 hours**.
The semester list is cached for 24 hours, each semester for an hour. Failed
requests count; there are no automatic retries. An HTTP 429 stops requests for
at least 24 hours and honors a longer Retry-After. No refresh scheduler is enabled.
Fetch only the semesters you actually need, preferably less often than hourly.

## Local cache and quota accounting

`frontend/.resis-cache/` stores responses and `usage.json` before requests are
sent. It is gitignored. Keep this directory across runs; do not delete the
ledger to bypass a cooldown or budget. The fixed path is independent of CWD.
An exclusive directory lock prevents concurrent local requests. A crashed process
may leave `request.lock`; verify the process has stopped before removing **only
that lock directory**. A failed response remains on cooldown rather than being
retried. Saved data remains available with `--offline`.

Use one maintenance checkout/machine for this key. The ledger only accounts for
calls through this checkout: other machines, tools, and direct curl calls share
the provider's limit and must be accounted for separately. Never run this client
inside a request handler, browser component, ephemeral serverless job, or build.

## Fetch and validate (no database writes)

From `frontend/`:

```bash
npm run sync:resis -- --semesters
# Wait at least 21 seconds before requesting another uncached resource.
npm run sync:resis -- --semester 202720
```

Both operations POST to `https://resis.org/api/` with `X-API-Key`, JSON, gzip,
and `uniId: "1"` (AUB). `listSemesters` gives the semesterID/semesterName values;
`getSemester` returns CRN-keyed sections. There is no hidden second API call when
fetching a semester: fetch the semester list explicitly first. University 2 is
LAU and is intentionally not supported by this AUB catalogue importer.

```bash
# Revalidate a saved response without contacting Resis:
npm run sync:resis -- --semester 202720 --offline
```

The normalizer validates all sections before import. It preserves section
prerequisite text and OR/AND expressions, instructors, attributes, meetings,
restrictions, credits, source timestamps, and validated AUB SIS detail links.
Empty prerequisite arrays or the API's empty registration-rule objects mean
**no textual rule supplied**, not confirmed absence of prerequisites. Unexpected
nonempty prerequisite structures stop the import for review.

## Import and publish

Apply the `resis_semester_catalogue` migration first. The importer needs the
existing server-only Supabase maintenance credentials. For a local database set
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. For hosted imports use
`HOSTED_SUPABASE_URL` and `HOSTED_SUPABASE_SECRET_KEY` in `.env.hosted.local`.

```bash
npm run sync:resis -- --semester 202720 --offline --apply
npm run sync:resis -- --semester 202720 --offline --apply --hosted
```

Without `--apply`, no database writes occur. These examples reuse the saved
response and spend **zero additional Resis requests**. API keys, Supabase keys,
responses and quota ledgers are never committed. Database errors report a stage
and code, not raw provider messages or credentials.

`courses` remains the stable catalogue keyed by code. Existing IDs, detailed
names/descriptions, departments, grade requirements, reviews, and planner links
are preserved. Missing courses are inserted with `data_source = 'resis'`, a
clearly labeled unavailable full description, and unverified catalogue
requirements. Their actual registration rules live in the semester sections.
This avoids replacing richer AUB catalogue rules with shorter SIS expressions.
Department names are reused from the same subject where available; otherwise
the verified subject code is used. Four-digit numbers such as `EXPR 0000` are
supported without dropping leading zeroes.

`resis_imports` and `course_offerings` stage an immutable snapshot. The
service-only `activate_resis_import` function validates the expected course
count and swaps a semester's active pointer in one transaction. A failed or
partial import leaves the previous semester snapshot readable. Older snapshots
cannot replace newer ones. Rerunning the exact cached snapshot is a no-op.
Historical inactive snapshots are retained for recovery; maintainers may remove
inactive imports when appropriate (active imports are protected by a foreign key).

Signed-in students have SELECT-only access to imported semesters and active
offerings through RLS and the security-invoker view. Anonymous clients cannot
read them. Students cannot run the staging/publication functions or read import
administration rows. Only the trusted maintenance role can write these tables.

## User-facing behavior

The catalogue has a semester selector; selected-term searches and rating filters
apply before counts and pagination. URLs retain semester selection across
course/detail/comparison navigation. Cards show instructors and attributes for
the selected term. Details show section CRNs, instructors, attributes, meetings,
restrictions, prerequisite expressions, and individual source update times.
All catalogue courses remain available when no semester is selected. An absent
offering means no imported data; it does not prove the university does not offer
the course. The planner and recommendations can find newly inserted courses
through their existing shared-catalogue queries; this change does not silently
add section times to a student's plans.

## Verification

`node tests/resis.test.mjs` covers quota/cache/concurrency protections with mocked
HTTP, response mapping, database permissions, stable course facts, incomplete
imports and atomic publication. Course unit and browser tests cover semester
scoping, links, section details, existing prerequisites, filters and mobile layout.
No test requires a live Resis key or makes Resis requests.

## Initial verified import (8 November 2026)

- Fall `202710`: 1,456 courses and 3,534 sections.
- Spring `202720`: 1,371 courses and 3,244 sections.
- 876 missing courses added; shared catalogue increased from 2,504 to 3,380.
- Three real Resis requests total: one semester list and two semester datasets.
- Applied migration version: `20261108193027`; local filename matches hosted history.
- Live permission checks confirmed authenticated reads, denied anonymous reads,
  denied student import execution, and preservation of CMPS 271's minimum C+ rule.

The security advisor reports an informational `rls_enabled_no_policy` finding
for `resis_imports`. This is intentional: it is maintenance-only, ordinary roles
have no grants, and the service role bypasses RLS. No new warning-level finding
was reported for these objects. See the [Supabase linter explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Coverage audit (11 November 2026)

Compared the active hosted data with the saved 8 November responses without
contacting Resis. Every cached course and CRN was present in the correct term:
1,456 courses / 3,534 sections in Fall and 1,371 / 3,244 in Spring. Sorted
content digests also matched for every section's code, CRN, section number,
title, credits, instructors, attributes, prerequisite text and meeting fields
(days, start/end, type, location and meeting instructor). The shared catalogue
still contains 3,380 courses, including the 876 added by the initial import.
This verifies completeness against those snapshots, not changes since 8 November
or semesters that have not been imported.

Section cards now show their own attributes without expanding; meeting slots
also identify their instructor when supplied. Unlisted attributes and TBA
instructors are retained as reported. Elective preferences allow required
attributes after selecting a semester, and only sections satisfying every
requested attribute plus the other chosen filters are recommended.

Rechecked the two course/elective browser journeys, 13 section-matching unit
tests, targeted lint and the webpack production build. Desktop and mobile card
screenshots were reviewed. Zero additional Resis requests were made; the local
ledger still contains three historical attempts. Resis availability was not
probed during this audit.
