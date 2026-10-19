# SCRUM-171: Rating averages

Date: October 19, 2026. Branch: `scrum-171`, based on pushed `scrum-170`
commit `cf3d2fa`. Jira task: **Done**.

## Completed

Created and deployed `public.course_rating_averages` to the CampusConnect
Supabase project (`udtdlctvckaaboycahuk`). This regular Postgres view returns
each course ID, review count and four numeric averages: difficulty, workload,
usefulness and overall experience. Each read uses current underlying rows,
so inserts, edits and deletions require no refresh job or aggregate trigger.

Courses without reviews have count `0` and `NULL` averages. Means retain
database precision; presentation rounding and the below-three-review message
belong to SCRUM-172. The existing review uniqueness constraint gives each
student one contribution per course.

The view is read-only, explicitly grants SELECT to authenticated callers and
the maintenance role, and denies anonymous access. `security_invoker = true`
preserves both underlying tables' grants and RLS policies. It exposes no
student IDs, review text or semester values. Existing indexes support filtered
lookups, so no new table, index or dependency was required.

## Files added

- `supabase/migrations/20261019082044_create_course_rating_averages.sql`:
  view, comments, explicit grants and PostgREST schema-cache notification.
- `frontend/tests/course-rating-averages.test.mjs`: 14 database cases covering
  all dimensions, multiple courses/students, precision, insert/edit/delete,
  cascades, access grants and invoker RLS under more restrictive policies.
- `supabase/queries/verify-course-rating-averages.sql`: rollback-only SQL Editor
  verification using two existing users and one empty course; creates no accounts.
- `supabase/COURSE_RATINGS.md`: column contract, authenticated Supabase query,
  batch-query guidance and SCRUM-172 display requirements.
- `SCRUM_171_REPORT.md`: this report.

The migration was generated with the installed Supabase CLI, tested locally,
then applied once through the plugin. Its filename matches the actual hosted
migration-history version, `20261019082044`.

## Verification and limits

- All **13 database/import test files** passed, including the new 14-case suite
  and the exact rollback SQL against PGlite. ESLint and `git diff --check` passed.
- Hosted metadata confirms a normal invoker view, authenticated/service SELECT,
  no anonymous SELECT and no authenticated/service writes through the view.
- Hosted reads return **2,381 view rows for 2,381 courses**, with **0 reviews**
  and no nonempty aggregates. No persistent review or account data was created.
- A filtered hosted query uses `courses_pkey` and
  `course_reviews_course_created_idx`; no additional index was needed.
- The hosted rollback write-test request returned the connector error
  `Invalid or expired requestState`. No successful hosted insert/edit/delete
  test is claimed. The tested SQL is included for manual SQL Editor execution.
- Security/performance advisors report no findings for the new view. Existing
  unrelated notices remain: [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
  [function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
  [anonymous definer-function grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [authenticated definer-function grants](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
  [Auth password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
  [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
  [RLS initplans](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
  [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index),
  and [multiple policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).
- No application/UI code changed; SCRUM-170's browser/build checks were not
  repeated for this database-only task.

## Jira and delivery

Marked **SCRUM-170 (Review form)** and its completed parent **SCRUM-46 (Submit a
course review)** Done. SCRUM-167/168/169 were already Done. Confirmed the pushed
SCRUM-170 commit and its open PR #20. Marked SCRUM-171 Done after deployment and
verification; parent **SCRUM-47 (Course ratings)** is In Progress while
**SCRUM-172 (Rating summary)** remains To Do.

All five SCRUM-171 files remain uncommitted and unpushed for manual delivery.
Use `scrum-170` as the PR base while the earlier stacked PRs remain unmerged.
Next task: SCRUM-172, which displays the four averages on course cards and
detail pages with “not enough reviews yet” below three reviews.
SCRUM-166's held catalogue entries and deferred PhD entries remain separate.
