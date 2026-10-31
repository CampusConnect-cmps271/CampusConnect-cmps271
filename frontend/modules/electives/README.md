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
GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart the development server or redeploy after changing the environment.
The model can be changed to a supported text model available to your Google
project. The default follows Google's current [model list](https://ai.google.dev/gemini-api/docs/models);
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

Catalogue reads are ordered and paginated through every accessible course,
across all departments, without a 5,000-record cutoff. The top twenty results
are shown (or fewer when fewer candidates exist). Rating reads overlap up to
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
