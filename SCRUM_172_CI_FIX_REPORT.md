# SCRUM-172 CI fix

## Problem and fix

The review editor could accept changes to its server-rendered controlled fields before React attached the input handlers. On a fast edit after reload, the old review could be appended to the replacement text. GitHub Actions run 39279841558, attempt 2, reproduced this in the create/reload/edit/delete journey.

The form now disables its fields and delete controls until hydration completes, using `useSyncExternalStore` with distinct server and client snapshots. Existing saving and deleting guards continue to apply. This backports the focused fix already present in SCRUM-173 to SCRUM-172, where PR #23 still uses the earlier editor.

## Files changed

- `frontend/modules/reviews/ReviewForm.tsx`: prevent interaction before hydration.
- `frontend/tests/e2e/reviews.spec.ts`: delay JavaScript during reload, check that editing is disabled, then verify that replacement text saves exactly and survives reload.
- `frontend/tests/e2e/mock-supabase.mjs`: add an isolated synthetic account for the regression test.
- `SCRUM_172_CI_FIX_REPORT.md`: this report.

## Validation

- 347 unit tests passed.
- TypeScript checking and ESLint passed.
- All 70 browser tests passed in one full run (3.4 minutes), including the delayed-JavaScript regression, exact review replacement, expired-session protection, and ratings refresh. Google Fonts timed out in this checkout; Next.js used its fallback font and the suite passed without font mocks.
- Whitespace checks passed.

Tests use isolated mock services on ports 3100 and 3101. There are no database migrations or hosted data changes. The development server at port 3000 and the separate SCRUM-143 checkout are preserved.

## Delivery

Prepared on branch `scrum-172` in the separate managed checkout `/home/mohamadghosn/.codex/worktrees/scrum-172-ci-fix/CampusConnect-cmps271`. Commit and push these four files to update existing PR #23; no new PR is needed for this correction. GitHub Actions must run again after the push before its status can be considered resolved.
