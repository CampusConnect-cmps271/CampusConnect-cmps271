# SCRUM-166: Course catalogue import

Date: October 15, 2026
Last updated: October 17, 2026

**Owner:** mohamad ghosn — verified through the connected Atlassian account and
[SCRUM-166](https://cmps271a.atlassian.net/browse/SCRUM-166).
Parent: [SCRUM-44 — Course discovery](https://cmps271a.atlassian.net/browse/SCRUM-44).

**Scope rule:** work only on tasks assigned to this account. Verify the Jira
assignee before starting each subsequent task; the team has divided ownership.

## Result and approach

Implemented the course data foundation first because browsing, course pages,
reviews, ratings, filters and comparison depend on it. Added a Postgres migration
with the six catalogue fields, stable UUIDs, a unique normalized course code,
validation constraints, a department/code index and RLS. Signed-in students can
read; only trusted maintenance code can write.

Added a Node importer using the existing Supabase SDK and Zod dependencies.
It validates the entire CSV before connecting, handles quoted/multiline/Arabic
content, rejects duplicate codes, and upserts batches of 200. Existing course IDs
survive updates. Prerequisite prose is preserved to retain AND/OR semantics.
An offline dry run and separate local/hosted target modes support review before
importing. No packages were added.

**Delivery status:** implementation verified locally and the courses migration
applied to hosted CampusConnect on October 17, 2026 through the Supabase plugin.
Importing an authoritative catalogue CSV remains pending; the table currently
contains zero rows. The bundled CSV is synthetic. Jira statuses and credentials
were not changed, and this deployment follow-up makes no Git commit or push.

## Files added or changed

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261017091812_create_courses.sql` | Course schema, constraints, index and access policies; renamed to match the hosted migration version. |
| `frontend/scripts/import-courses.mjs` | CSV validation and Supabase import CLI. |
| `supabase/data/courses.example.csv` | Two explicitly synthetic example rows. |
| `frontend/tests/course-import.test.mjs` | CSV, target selection, SDK requests and batch failure tests. |
| `frontend/tests/courses.test.mjs` | Migration, permissions, constraints and reimport tests using PGlite. |
| `frontend/package.json` | Adds `npm run import:courses`. |
| `supabase/COURSES.md` | Migration/import instructions, input format and failure recovery. |
| `README.md` | Links to catalogue setup instructions. |
| `SETUP_REPORT.md` | Links to this latest task report. |
| `TASK_REPORT.md` | This report and the retained architecture/task reference. |

## Verification

- All 16 new import/database tests passed, with detailed results checked in
  Node's test runner using `--experimental-test-isolation=none`.
- `npm test` passed: 232 unit tests and all 9 database/helper test files.
- ESLint and TypeScript checks passed. The first typecheck found stale generated
  `.next/dev/types` references to routes absent from this checkout; those ignored
  generated files were moved to `/tmp` and the route types regenerated successfully.
- The example CSV passed the actual CLI's offline dry run.
- Production build passed with `npm run build -- --webpack` and network access
  for the app's existing Google Fonts. The default Turbopack attempt was blocked
  by the environment's worker port-binding restriction; no build configuration
  or existing font code was changed.

## Hosted deployment verification — October 17, 2026

- Verified SCRUM-166 is still assigned to mohamad ghosn before deployment.
- Confirmed the CampusConnect project (`udtdlctvckaaboycahuk`) had no courses
  table, then applied the prepared SQL as migration `20261017091812_create_courses`.
- Verified all eight columns, primary/unique keys, department/code index, RLS
  policy and role grants on the hosted database. `authenticated` has SELECT
  only; `anon` has no table access; `service_role` has SELECT, INSERT and UPDATE.
- Live transaction tests passed for service-role inserts, stable IDs on upsert,
  updated metadata, rejected negative credits and duplicate codes, signed-in
  reads, denied student updates and denied anonymous reads. All verification
  rows were rolled back; the table remains empty.
- Renamed the local migration from `20261015090000` to Supabase's actual
  `20261017091812` version and updated the test and documentation references.
  This prevents future migration pushes from treating the same DDL as pending.
- Re-ran all 16 catalogue tests after synchronizing the migration version; all
  passed. Whitespace checks passed as well.
- Security advisors reported no findings for `courses`. They did report existing
  role functions callable as SECURITY DEFINER by
  [anonymous](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  and [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
  users, and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  An [RLS-without-policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  also matches the existing service-only `app_logs` design. These findings are
  outside SCRUM-166; no other feature's permissions or Auth settings were changed.

## Architecture reference retained for future tasks

Follow the diagram supplied by the user on October 15: Next.js App Router pages
for students, club representatives and moderators; a Next.js server on Vercel;
`proxy.ts` for session/role guarding, server actions for form writes, and route
handlers for AI/moderation integrations. Supabase provides Auth, Postgres with
RLS, Storage and Realtime. The diagram also includes an external LLM API, Sentry
and future pgvector course embeddings. These are architecture targets, not claims
that every integration already exists.

Keep the repository's React/TypeScript/Tailwind stack and modular monolith.
Pages stay thin and feature logic belongs in `frontend/modules/`. This task
implements the Postgres layer and its maintenance import script only.

## Assigned work queue retained from Jira

Snapshot: October 15, 2026. All 18 issues were marked To Do in Sprint 2. Parent
stories and their subtasks describe the same work, so do not double-count them.
Recheck current ownership and status before starting the next item.

| Story | Your assigned subtasks |
| --- | --- |
| SCRUM-44: Course discovery | SCRUM-166 schema deployed; official CSV import pending; SCRUM-167 browse/search. |
| SCRUM-45: Course information | SCRUM-168 course page. |
| SCRUM-46: Course reviews | SCRUM-169 review storage; SCRUM-170 review form. |
| SCRUM-47: Course ratings | SCRUM-171 rating averages; SCRUM-172 rating summary. |
| SCRUM-63: Post search | SCRUM-142 search index/query; SCRUM-143 search page. |
| SCRUM-65: Course filters | SCRUM-173 URL-persisted filters. |
| SCRUM-68: Course comparison | SCRUM-174 comparison page. |

Suggested next task: **SCRUM-167**, after rechecking its assignee. The course
browse/search page consumes the catalogue created by this task.
