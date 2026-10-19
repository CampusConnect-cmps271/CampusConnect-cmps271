# SCRUM-167: Course browse and search

Date: October 18, 2026

Status: implemented locally and validated; ready for review and manual commit/push.

## Task and result

Implemented **SP2-44 · Course browse and search**, assigned to Mohamad Ghosn
in **SCRUM Sprint 2**. Signed-in, email-verified students can open `/courses`
from **Browse courses** on the home page, browse department groups, and search
case-insensitively by course name or code. Compact codes such as `CMPS240`
are accepted. Cards display code, title, credit count and a description excerpt.
Clicking a course's code, title or **Read full description** expands its entire
description in place. Click again to collapse it. The native disclosure also
supports Enter/Space, preserves paragraph breaks, and works without JavaScript.

Results have 24 courses per page. Search and department selection remain in
pagination URLs; submitting the search form starts again at page one. Stale
page numbers are clamped to the last available page. The page includes loading,
no-results and retry states, keyboard focus styling, and a responsive layout.

## Implementation

The App Router page calls the existing verified-user guard. Query logic lives
in `modules/courses` and uses the existing cookie-based Supabase server client
and authenticated SELECT policy. Search values are quoted for PostgREST and
SQL LIKE `%`/`_` characters are escaped. The department projection is paged so
departments after Supabase's first 1,000 rows are included. Only the current
page's course records are rendered. Database error details stay on the server.

A read-only hosted check confirmed **2,381 courses and 59 departments**.
This task required no database migrations, imports, or policy changes. The 78
held entries and deferred PhD records remain set aside. Course detail pages,
reviews, ratings and comparison remain separate tasks.

## Files added

- `frontend/app/(protected)/courses/page.tsx`: route and authentication guard.
- `frontend/app/(protected)/courses/loading.tsx`: loading state.
- `frontend/modules/courses/CourseCatalogue.tsx`: search form, expandable course
  descriptions, grouped cards, pagination, empty state and retry UI.
- `frontend/modules/courses/catalogue.ts`: authenticated catalogue queries.
- `frontend/modules/courses/search.ts`: input normalization, search expression
  quoting and pagination URL construction.
- `frontend/modules/courses/courses.module.css`: scoped responsive styles.
- `frontend/modules/courses/catalogue.test.ts`: query, parsing, authentication,
  escaping, pagination and failure tests.
- `frontend/tests/e2e/courses.spec.ts`: catalogue browser journeys.
- `frontend/tests/e2e/mock-courses.mjs`: synthetic local Supabase fixtures.
- `SCRUM_167_REPORT.md`: this report.

## Existing files changed for this task

- `frontend/app/(protected)/home/page.tsx`: added Browse courses navigation.
- `frontend/tests/e2e/mock-supabase.mjs`: connected the local course fixtures.

Earlier uncommitted SCRUM-166 reports and research files were preserved in
the named Git stash **SCRUM-166 local reports and research before scrum-167**
(`79e2bcf65d477cd48ee78035ab780c41dff9fa13`). Restore it on the SCRUM-166
branch when returning to that work, after committing or saving SCRUM-167 work.
The downloaded catalogue cache remains on disk and is excluded locally through
`.git/info/exclude`, preserving its previous exclusion from GitHub.
No files were staged, committed or pushed by this task, and no Jira status was
changed. The working branch is now **`scrum-167`**, based on `origin/main` at
`344c8e5`, with no upstream configured until its first feature-branch push.

## Verification

- ESLint and TypeScript route/type checks passed.
- All 249 unit tests passed, including 12 catalogue tests.
- All 12 existing Node database/import test files passed.
- All 45 browser tests passed, including five new catalogue journeys:
  signed-out access, department browsing/pagination, code/title search and
  punctuation, mobile layout/stale pages, and failure/retry behaviour.
- Follow-up description expansion: lint and TypeScript checks passed; added a
  browser regression covering complete long text, click/keyboard expansion,
  collapse, paragraph formatting and mobile overflow. All six catalogue browser
  tests passed on the separated `scrum-167` branch. Inspected the expanded
  mobile description screenshot as well.
- Mobile screenshot inspected at 375px width; no horizontal overflow.
- Production build passed with `npm run build -- --webpack` and includes
  `/courses` as a dynamic server-rendered route. Default Turbopack validation
  encountered an environment error while binding an internal CSS worker port;
  the earlier sandboxed build also could not download Google Fonts. The
  supported Webpack build succeeded with network access, without changing
  the project's build configuration.

Browser journeys use synthetic local Auth/database fixtures, not hosted user
accounts. A manual check with a real verified student is still appropriate
before deployment: sign in, choose Browse courses, and search `CMPS 240`,
`CMPS 241` and `CMPS 261`.

## Repository synchronization

The initial remote check found no additional `origin/main` commits to integrate.
The original `codex/scrum-166-supabase-sync` branch retains extractor commit
`93cd826`. SCRUM-167 was subsequently separated onto `scrum-167` directly from
`origin/main` (`344c8e5`), so that extractor commit is excluded from this branch.
