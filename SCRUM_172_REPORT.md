# SCRUM-172: Course rating summaries

Date: October 19, 2026. Branch: `scrum-172`, based on pushed SCRUM-171 commit
`1502ded`. Jira: **In Progress**, ready for user review after verification.

## What was done

Added the four average ratings and review count to course cards and course
detail pages using SCRUM-171's existing Supabase view. Averages appear at
**three or more reviews**, rounded to one decimal place for display. Below
three, the UI shows the actual count and “Not enough reviews yet” without
rendering any average scores. The scale explains that higher difficulty and
workload mean harder courses and heavier workloads.

Queries use the authenticated server client and fetch the displayed catalogue
page's course IDs in one batch. Results are validated before rendering.
Missing, malformed or failed results show a separate unavailable message while
preserving course content and the review form. Existing review-action
revalidation refreshes summaries after create/edit/delete. No new migration or
package was needed.

## Files added or changed

- `frontend/modules/ratings/model.ts`: response validation, three-review rule,
  summary states and display formatting.
- `frontend/modules/ratings/queries.ts`: authenticated, bounded batch reads.
- `frontend/modules/ratings/RatingSummary.tsx`, `RatingSection.tsx` and
  `ratings.module.css`: shared accessible summaries and responsive styling.
- `frontend/modules/courses/CourseCatalogue.tsx` and `CourseDetail.tsx`:
  integration into cards and details; labelled course facts separately.
- `frontend/modules/ratings/model.test.ts` and `queries.test.ts`: threshold,
  numeric validation, authentication, batching and safe failure coverage.
- `frontend/tests/e2e/mock-ratings.mjs`, `mock-courses.mjs`, `mock-reviews.mjs`
  and `mock-supabase.mjs`: synthetic averages from baseline reviews plus test
  form submissions, and an isolated rating-editor account.
- `frontend/tests/e2e/ratings.spec.ts` and `course-detail.spec.ts`: browser
  coverage and selectors that distinguish course facts from rating definitions.
- `supabase/queries/cleanup-scrum172-demo-reviews.sql`: narrowly scoped removal
  of the explicitly requested manual-preview reviews described below.
- `SCRUM_172_REPORT.md`: this report.

## Verification

- All **347 unit tests** passed, including 34 new rating tests.
- All **7 new rating browser tests** passed, including the three-review
  boundary, live create/edit/delete refreshes, safe failure states and mobile
  layouts in light/dark modes. The **22 existing course/review browser tests**
  also passed. Mobile screenshots were inspected.
- Type checking, ESLint, `git diff --check` and the production build
  (`npm run build -- --webpack`) passed.
- Hosted read-only checks confirm the invoker view is available to signed-in
  users and denied to anonymous callers, with **2,381 courses**. Browser tests
  use synthetic data for zero through four reviews and do not write to hosted
  Supabase.

## Requested manual preview

At the user's request, added **three clearly marked demo reviews** to hosted
**CMPS 271 (Software Engineering)**, using the existing demo accounts Lina
Haddad, Karim Mansour and Rana Khoury. Bodies begin `[DEMO SCRUM-172]` and state
that they are synthetic, not actual student feedback; the semester is
`DEMO - Fall 2026`. No accounts, passwords, roles or existing reviews changed.

The live Supabase view confirms **3 reviews**, difficulty **3.0**, workload
**4.0**, usefulness **4.3** and overall experience **4.3** after display rounding.
Refresh the catalogue or open `/courses/CMPS-271` to inspect them. The cleanup
SQL matches course, demo account, semester and exact seeded body, protecting
unrelated or edited reviews. It has not been run; demo reviews remain for testing.

Changes remain uncommitted and unpushed for manual delivery. Use `scrum-171`
as the PR base while its PR #22 remains unmerged. Catalogue holds, filters and
course comparison are outside this task.
