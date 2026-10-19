# SCRUM-170: Course review form

Branch: `scrum-170`, created from the pushed SCRUM-169 commit `ef50b77`.
Jira: SP2-47, assigned to mohamad ghosn, Sprint 2. Status: **In Progress**
while awaiting user testing and pull request review.

## What changed

The course detail page now loads the signed-in student's own review and shows
a form for difficulty, workload, usefulness, overall experience, semester,
written feedback and an explicit “I completed this course” confirmation.
Ratings must be whole numbers from 1 to 5. Students can edit their review or
delete it after confirmation. Completion remains self-attested.

The same Zod schema validates the browser form and server action. All writes
authenticate the user on the server, check that the course exists, and use the
authenticated Supabase client with the existing SCRUM-169 RLS policies. The
owner comes from the verified session, never a submitted identity field.
Updates and deletes match the review ID, course, owner and original timestamp;
stale tabs cannot overwrite newer edits. Creating a duplicate returns a clear
message instead of overwriting the existing review.

Save actions call the team's shared restriction checker for English/Arabic
language rules, excessive links, duplicate recent content and submission
frequency. If checks fail, nothing is saved. Errors preserve the draft and
avoid exposing database details or writing review text to logs. Failed review
loads show a retry message instead of an unsafe blank submission form.

The form disables controls during requests, includes associated field errors,
fits a phone screen and preserves ratings/confirmation after the browser's
automatic action reset. Successful writes refresh the course page data.

## Files changed or added

- `frontend/modules/reviews/schema.ts`: shared field validation and explicit
  form-data parsing.
- `frontend/modules/reviews/types.ts`: review and action state types.
- `frontend/modules/reviews/queries.ts`: authenticated own-review loading.
- `frontend/modules/reviews/actions.ts`: guarded create, edit and delete.
- `frontend/modules/reviews/ReviewSection.tsx`: server-rendered load/error state.
- `frontend/modules/reviews/ReviewForm.tsx`: interactive form and confirmation.
- `frontend/modules/reviews/reviews.module.css`: responsive form styling.
- `frontend/modules/courses/CourseDetail.tsx`: form integration.
- `frontend/modules/reviews/schema.test.ts` and `actions.test.ts`: validation,
  authorization, concurrency and failure handling tests.
- `frontend/modules/moderation/restrictions.ts` and `restrictions.test.ts`:
  reuse the shared checker and its existing tests, extended for review queries.
- `frontend/modules/moderation/review-restrictions.test.ts`: review lookup,
  duplicate, frequency and unavailable-check coverage.
- `frontend/tests/e2e/mock-reviews.mjs`: synthetic review storage for tests.
- `frontend/tests/e2e/mock-supabase.mjs` and `mock-courses.mjs`: isolated review
  test users, review requests and course-ID filtering.
- `frontend/tests/e2e/reviews.spec.ts`: review browser journeys and failures.
- `frontend/tests/e2e/course-detail.spec.ts`: updated form expectation.
- `SCRUM_170_REPORT.md`: this report.

## Shared dependency

The canonical restriction checker was absent from this checkout. Its source
and existing tests were reused from the team's open moderation
[PR #12](https://github.com/CampusConnect-cmps271/CampusConnect-cmps271/pull/12),
commit `951e54a`, rather than implementing a second rule list. The extension
adds `review` and queries `course_reviews.student_id`; review submissions use
the existing five-per-minute comment limit, and edits exclude their own row.
Duplicate checks cover that same recent window, as in the shared checker.
The rule list stays in a server-only module. Reconcile this small extension
when the moderation branch merges. No other moderation files or migrations
were copied or changed.

## Verification

- `npm test`: 313 unit tests and all 12 database/import test files passed.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: all 62 browser tests passed,
  including nine review journeys. Mobile rendering was also inspected.
- `npm run typecheck`, `npm run lint` and `git diff --check`: passed.
- `npm run build -- --webpack`: production build passed. Checked all 51
  generated client JavaScript files: server-only restriction terms and the
  rule evaluator were absent.

Browser tests use synthetic accounts and a local HTTP fixture, not production
students or review data. Database policy tests use PGlite. Hosted review-write
verification remains the separate limitation recorded in SCRUM-169; these
checks do not claim a successful hosted write test.

## Testing and delivery

Open `/courses/CMPS-240` while signed in, scroll to “Ratings and reviews,” fill
all fields and submit. Reload to check persistence, edit and save, then try
Cancel and Confirm delete. The existing hosted SCRUM-169 table is used; this
task requires no new migration. No real reviews were created by automated tests.

Ratings averages and the public review display remain SCRUM-171/172. Catalogue
holds and deferred PhD entries remain separate. Changes are uncommitted and
unpushed so the user can review, commit and push manually. The branch is based
on `scrum-169`; use that PR base until the earlier stacked branches are merged.
