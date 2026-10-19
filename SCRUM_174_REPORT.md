# SCRUM-174: Course comparison

Date: October 19, 2026. Branch: `scrum-174`, based on pushed SCRUM-173
commit `7eb14a0`. Jira: SP2-51, assigned to Mohamad Ghosn.

## What was done

Students can select two or three courses from catalogue cards or course
details and open `/courses/compare`. The table compares credits, department,
the complete prerequisite statement, review count, and all four average
ratings. Ratings use the existing three-review threshold and one-decimal
display. No listed prerequisite is distinguished from a missing course;
unavailable ratings are distinguished from insufficient reviews.

Selection order and browsing filters remain in the URL through searches,
pagination, refresh, details and return links. A fourth selection is disabled.
Students can remove courses on the comparison page, change the selection or
clear it. Clearing search filters keeps the selected courses. Invalid,
duplicate, missing and inaccessible course selections have safe states.
The table scrolls within a phone viewport, supports keyboard scrolling, keeps
row labels visible, and supports light and dark modes.

The server validates and normalizes codes, reads at most three courses in one
authenticated Supabase query, and reuses the existing batch ratings reader.
Underlying RLS applies. No new package, database migration, account, course or
review was needed. The three existing CMPS 271 demo reviews remain available.

## Files added or changed

- `frontend/app/(protected)/courses/compare/page.tsx` and `loading.tsx`:
  protected comparison route, loading UI and selection validation.
- `frontend/modules/courses/CourseComparison.tsx`, `comparison-query.ts` and
  `comparison.module.css`: table, validated batch query, retry and mobile UI.
- `frontend/modules/courses/ComparisonSelection.tsx`, `comparison.ts` and
  `codes.ts`: selection controls, URL builders and bounded code parsing.
- `frontend/modules/courses/CourseCatalogue.tsx`, `CourseDetail.tsx`,
  `CourseFilterForm.tsx`, `search.ts` and `references.ts`: selection integration
  and retention of existing filters, detail links and code normalization.
- `frontend/modules/courses/comparison.test.ts` and
  `comparison-query.test.ts`: 28 unit cases for selection, parsing, query
  bounds, ordering, authentication, credit precision and safe failures.
- `frontend/tests/e2e/course-comparison.spec.ts` and `mock-courses.mjs`:
  seven comparison browser cases and a synthetic query-failure fixture.
- `SCRUM_174_REPORT.md`: this report.

## Verification and delivery

All **402 unit tests**, **7 new comparison browser cases**, and **20 existing
catalogue, detail and filter browser cases** passed. Type checking, ESLint,
whitespace checks and the production build (`npm run build -- --webpack`)
passed. Mobile screenshots were inspected in light and dark modes.

Hosted read-only checks confirm CMPS 240, CMPS 271 and MATH 201 have the
expected comparison fields, with only CMPS 271 meeting the three-review
threshold in that sample. Browser tests use isolated synthetic fixtures.

SCRUM-173 and parent SCRUM-65 are **Done** in Jira; PR #24 remains open.
SCRUM-174 and parent SCRUM-68 are **In Progress**, pending user review and
manual commit/push. Use `scrum-173` as the PR base while PR #24 is unmerged.

Next implementation tasks: **SCRUM-142** (post search) and **SCRUM-143** (search
page). **SCRUM-166** remains the held catalogue-data backlog; its 78 active
holds and deferred PhD entries remain set aside.
