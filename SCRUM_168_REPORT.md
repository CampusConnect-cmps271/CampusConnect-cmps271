# SCRUM-168: Course page

Date: October 18, 2026

## Result

Implemented **SP2-45 · Course page**, assigned to Mohamad Ghosn in Sprint 2.
Each catalogue card now has a **View course** link to a page such as
`/courses/CMPS-240`. The page shows the full description, credits, department,
and prerequisites, and reserves a section for future ratings and reviews.
The existing expandable catalogue descriptions remain available.

Prerequisite links open the referenced course's own page. The original prose,
AND/OR choices, grade requirements, consent conditions, and paragraph breaks
are preserved. Compact references, suffixes and leading zeros are supported;
immediately connected lists such as `MATH 201, 202 or 203` are also resolved.
References are linked only when their course exists in the imported catalogue.
Unavailable references stay plain text with an explanation. Empty prerequisite
fields say that no prerequisites are listed, without asserting there are none.

Catalogue search, department and pagination context survive navigation through
course/prerequisite pages and **Back to courses**. The department name links
to that department's catalogue. Verified sign-in is required for direct links.
Missing courses have a not-found page; query failures have a retry state.
Prerequisite lookup failures leave the course and its original rules readable.

## How it works

Thin App Router files delegate to the courses module. The detail query uses
the existing authenticated Supabase server client and RLS SELECT permission.
No database schema, policy, catalogue record, or dependency was changed.
Prerequisite lookups are deduplicated and batched in groups of at most 100.
Ratings/review storage and forms remain separate Jira tasks; no sample ratings
or invented review counts are displayed.

## Files

Added:

- `frontend/app/(protected)/courses/[code]/page.tsx`, `loading.tsx`, and
  `not-found.tsx`: detail route, metadata, loading and missing-course states.
- `frontend/modules/courses/CourseDetail.tsx`: course information and navigation.
- `frontend/modules/courses/detail.ts`: guarded detail and reference queries.
- `frontend/modules/courses/references.ts`: route normalization and prerequisite
  reference parsing that preserves the source text.
- `frontend/modules/courses/detail.test.ts`: parser and query tests.
- `frontend/tests/e2e/course-detail.spec.ts`: browser journeys.
- `SCRUM_168_REPORT.md`: this report.

Changed:

- `frontend/modules/courses/CourseCatalogue.tsx`: View course links.
- `frontend/modules/courses/courses.module.css`: responsive detail-page styles.
- `frontend/tests/e2e/mock-courses.mjs`: synthetic course detail/prerequisite
  fixtures, exact-code lookup and controlled lookup failures.

## Validation

- All 264 unit tests pass, including 15 new detail/reference tests.
- ESLint and TypeScript route/type checks pass.
- All 13 course browser tests pass: seven detail-page journeys and six existing
  catalogue journeys. These cover login protection, prerequisite navigation,
  retained search context, shorthand and missing references, absent requirements,
  not-found and retry states, lookup failures, and mobile layout.
- Inspected the mobile detail screenshot at 375px width; complete paragraphs
  remain visible and there is no horizontal overflow.
- Read-only hosted queries confirmed CMPS 240/241/261 data, suffix-bearing
  prerequisite examples and the existence of CMPS 221, EECE 321, CMPS 202 and
  EECE 330 as actual prerequisite link targets.
- Production build passed with `npm run build -- --webpack`, matching the
  successful SCRUM-167 build mode. `/courses/[code]` is included as a dynamic
  server-rendered route.

Browser tests use local synthetic users and courses; no hosted accounts were
created or modified. A live check in the existing browser tab was prevented by
the browser access policy; no attempt was made to bypass it. Manual test:
open `http://localhost:3000/courses/CMPS-240`, check the full description and
prerequisites, then follow CMPS 221 or EECE 321. The normal development server
was restarted on port 3000 after browser tests. Its existing missing
`SUPABASE_SECRET_KEY` warning still affects server-side log persistence.

## Existing data issue flagged during this task

A read-only hosted check found BIOC 303B's prerequisite field currently says
concurrent BIOC 303A/303B registration is permitted without mentioning consent.
The user's earlier clarification required a department/instructor waiver.
Flagged this discrepancy immediately; preserved the stored text for this UI
task. Resolve it through the SCRUM-166 catalogue correction workflow rather
than silently rewriting registration rules in the frontend. The 78 held
entries and deferred PhD records remain set aside.

## Branch and delivery

Working branch: `scrum-168` (renamed at the user's request), based on the pushed `scrum-167` commit
`fc2e3a9`. SCRUM-167 PR #16 was still open when this branch was created.
Review the SCRUM-168 diff against `scrum-167` until #16 is merged; afterwards
the usual PR target is `main`. No files were staged, committed or pushed and
no Jira status was changed. SCRUM-166 research remains in its named stash.
