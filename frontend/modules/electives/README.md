# Elective preferences, recommendations and review evidence

Direct feature URLs (shared navigation remains owned by the navigation ticket):

- `/electives/preferences`: private, editable preferences.
- `/electives/recommendations`: authenticated catalogue recommendations and optional review evidence.
- `POST /api/electives/recommendations`: validated `ElectivePreferences` JSON, same-origin, no-store.
- `POST /api/electives/analysis`: `{ "course_id": "catalogue UUID" }`, same-origin, no-store.

Apply the additive `elective_preferences` migration before deploying these routes.
The existing catalogue and published review tables are prerequisites. No held
catalogue imports or other owners' Sprint 3 features are required.

## Provider configuration

The baseline works without any AI configuration. Optional AI calls use a
server-only HTTPS JSON adapter, configured with `ELECTIVES_PROVIDER_URL` and
`ELECTIVES_PROVIDER_TOKEN`. Never prefix these with `NEXT_PUBLIC_`. Configure a
trusted provider gateway that implements the contract below; the app does not
assume a vendor-specific API. No production gateway or credentials are bundled.

Requests contain `{ operation, input, instructions }` with bearer authentication.
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
analysis calls per request. Configure gateway authentication, quotas and rate
limits before enabling AI in production. Provider failures leave the catalogue
baseline and source evidence usable. Tests inject deterministic providers;
fixtures are never enabled as a production substitute.

Catalogue reads are ordered and paginated through every accessible course,
across all departments, without a 5,000-record cutoff. Up to twenty courses matching a complete interest group
are shown; partial or unrelated matches are not used to fill the list. Rating reads overlap up to
four requests at a time; each ID filter contains at most 100 courses.
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

## Branch sequence

Each subtask has its own dependent branch and commit: `scrum-212` through
`scrum-220`, under `mohamad/`. Review/merge in that order, or use the three story
branches `mohamad/scrum-48-elective-preferences`,
`mohamad/scrum-49-ai-recommendations`, `mohamad/scrum-50-review-analysis`.
The story branches collect their three subtasks; their scope is measured
against the previous story branch. All start from the latest main pulled for
this work. Do not merge a later branch while omitting its prerequisites.

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
