# SCRUM-173: Course filters

Date: October 19, 2026. Branch: `scrum-173`, based on pushed SCRUM-172
commit `c4738e1`. Assigned task: SP2-50, Course filters.

## What was done

Added minimum/maximum filters for credits, difficulty and workload alongside
the existing course search and department selector. Filters remain in URL
search parameters through refreshes, pagination, course details and return
links. New searches reset pagination; Back navigation restores controls to
match the URL. Clear also removes unsent filter edits. Inverted ranges show
an actionable error. The form fits phone screens.

Rating filters use the same rounded, one-decimal averages displayed on cards,
and only match courses with at least three reviews. Credit-only searches
include unrated, zero-credit and fractional-credit courses. All predicates
apply in Postgres before counting or pagination, including courses outside
the first page. Failed rating queries show a retry state preserving filters.

Added and deployed Supabase migration `20261019155314`, creating the read-only
`course_filter_catalogue` view with invoker security and explicit SELECT-only
grants for authenticated users and service maintenance. Underlying course and
review RLS still applies. No package, course row or review row was added or
changed for this task. Hosted totals remain **2,381 courses and 3 demo reviews**.

Browser verification also caught a review-edit hydration race. Review controls
now wait for their handlers before accepting input, preventing replacement
text from being combined with the previous review during a slow reload.

## Files added or changed

- `frontend/modules/courses/search.ts`: numeric parsing, validation and URL
  serialization; `filters.test.ts`: parsing and URL regression tests.
- `frontend/modules/courses/catalogue.ts` and `catalogue.test.ts`: server-side
  bounds, rating-view selection, consistent counts and failure handling.
- `frontend/modules/courses/CourseCatalogue.tsx`, `CourseFilterForm.tsx` and
  `courses.module.css`: accessible controls, history restoration, Clear and
  responsive layout.
- `frontend/modules/reviews/ReviewForm.tsx`: safe hydration before editing.
- `supabase/migrations/20261019155314_create_course_filter_catalogue.sql`:
  deployed view definition and permissions.
- `frontend/tests/course-filter-catalogue.test.mjs`: 13 database behavior and
  access-policy cases, using synthetic local data.
- `frontend/tests/e2e/course-filters.spec.ts` and `reviews.spec.ts`: filter,
  navigation, mobile, failure and delayed-hydration browser coverage.
- `frontend/tests/e2e/mock-courses.mjs`, `mock-reviews.mjs`, `mock-ratings.mjs`
  and `mock-supabase.mjs`: shared synthetic rating fixtures, range filtering,
  failure cases and an isolated review test account.
- `SCRUM_173_REPORT.md`: this report.

## Verification and delivery

- All **374 unit tests** and **14 database/import test files** passed.
  A direct run also confirmed all **13 new database cases** passed.
- All **24 filter, rating and review browser tests** passed after the fixes.
  The **13 existing catalogue/detail browser cases** passed earlier in this
  task. The mobile screenshot was inspected.
- Type checking, ESLint, whitespace checks and the production build
  (`npm run build -- --webpack`) passed.
- Hosted checks confirm CMPS 271 matches difficulty **3.0** and workload
  **4.0**, with three demo reviews. Security/performance advisors reported no
  finding for the new view; pre-existing notices remain outside this task.
- Development server restarted on port 3000; the protected catalogue responds
  with the expected sign-in redirect. Existing local configuration lacks
  `SUPABASE_SECRET_KEY`, so database log persistence is unavailable; catalogue
  filters use the authenticated client and do not require that key.

Jira: **SCRUM-172 and its parent SCRUM-47 are Done**. **SCRUM-173 and its
parent SCRUM-65 are In Progress**, pending user review and manual delivery.
Changes remain uncommitted and unpushed. Use `scrum-172` as the PR base while
PR #23 is unmerged. Course comparison and held catalogue entries remain for
later tasks.
