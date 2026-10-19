# SCRUM-169: Review data storage

Date: October 18, 2026
Branch: `scrum-169`, based on the pushed `scrum-168` commit `2bf9304`.
Jira status: **In Progress**, pending hosted write-test verification and review.

## Implemented

Created `public.course_reviews` and applied its migration to the CampusConnect
Supabase project (`udtdlctvckaaboycahuk`). The table stores four whole-number
ratings from 1 to 5, a written review, semester taken, completion confirmation,
and server-managed timestamps. A unique constraint enforces one review per
student per course, regardless of semester. Foreign keys reference existing
courses and Auth users and cascade on their deletion.

Signed-in students can read reviews, create them as themselves, and edit/delete
only their own review. RLS checks both existing and resulting ownership on
updates. Column grants also prevent changing the review's owner, course, ID or
timestamps. Anonymous callers have no access. The timestamp trigger is
security-invoker with an empty search path and cannot be called as a client RPC.

Fractional ratings are rejected rather than rounded. Written reviews must be
nonblank and at most 5,000 characters; semester labels must be nonblank and at
most 80 characters. Completion is explicitly self-attested, not independently
verified. Indexes support ownership checks and newest-first per-course lists.

The form remains SCRUM-170; averages/display remain SCRUM-171/172. The existing
course pages remain available, with their ratings/reviews placeholder.

## Files added

- `supabase/migrations/20261018191925_create_course_reviews.sql`: table,
  constraints, grants, policies, indexes, comments and timestamp trigger.
- `frontend/tests/course-reviews.test.mjs`: 26 database behaviour cases,
  including the rollback-only hosted verification script.
- `supabase/queries/verify-course-reviews.sql`: SQL Editor verification using
  two existing users and an existing course; every test write is rolled back.
- `supabase/COURSE_REVIEWS.md`: field contract, permissions, integration examples
  and verification instructions for the upcoming review form.
- `SCRUM_169_REPORT.md`: this report.

## Verification and limits

- All 12 database/import test files passed; the review file includes 26 cases
  for ownership spoofing, cross-user edits/deletes, duplicate reviews,
  immutable fields, invalid ratings, required text/confirmation, foreign keys,
  cascades, timestamps, anonymous access and service-role maintenance.
- The exact hosted verification script passes against PGlite and leaves no
  reviews behind. ESLint and `git diff --check` also passed.
- Supabase confirmed RLS enabled, all four policies present, anonymous read
  denied, authenticated review reads/writes granted, identity/timestamp changes
  denied, and the trigger helper unavailable to authenticated callers.
- Hosted verification script execution was attempted twice. Both requests
  returned the connector error `Invalid or expired requestState`; no successful
  hosted write-test result is claimed. The script is included for manual SQL
  Editor verification. Final hosted counts were **0 reviews and 2,381 courses**.
- Security advisors show no new findings for the review schema. Existing
  findings for other parts of the project were preserved, including
  [role-function execution grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [the comments trigger search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
  and [Auth password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Performance advisors found no review-table RLS or foreign-key-index warnings.
  The two new indexes have informational
  [unused-index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
  while the table is empty; retained them for the documented access patterns.
- No application runtime or UI code changed, so browser/build checks from
  SCRUM-168 were not repeated for this database-only task.

## Migration and delivery

Generated the migration with `supabase migration new create_course_reviews`,
tested it locally with PGlite, then applied it once through the Supabase plugin.
Aligned the local filename to the actual hosted migration version
`20261018191925`; migration history confirms that version and name.
The local Supabase service is not running on port 54322, so CLI local database
listing/diff verification was unavailable. No database reset or unrelated
teammate migration was applied or changed.

No review data, accounts or course rows were permanently created or modified.
No files were staged, committed or pushed. The 78 catalogue holds, deferred PhD
entries, SCRUM-166 stash and previously flagged BIOC 303B issue remain separate.
