# SP4-31: Core journey regression suite (SCRUM-273)

## Purpose

Run a focused, repeatable selection of the existing browser journeys before merging.
The tests use the same local mock Supabase backend and Chromium configuration as
`npm run test:e2e`. No production data or shared Supabase credentials are required.

## Covered journeys

| Existing spec | Core regression coverage |
| --- | --- |
| `tests/e2e/account-pages.spec.ts` | Guest access and redirects, login, signup validation, verified logout, profile edit and read-only profiles |
| `tests/e2e/community-journey.spec.ts` | Sign-in protection, create a post, feed, comments/replies, votes, saved posts and mobile display |
| `tests/e2e/courses.spec.ts` | Restricted course access, department filtering, search, pagination, descriptions and failure states |
| `tests/e2e/messaging.spec.ts` | Starting conversations, sending and persisting messages, unread state, recipient access, unauthorized access and mobile navigation |

## Commands (run from `frontend`)

```powershell
npm run test:regression
npm run test:e2e
```

Playwright launches the isolated mock backend and the Next.js development server
using the existing `playwright.config.ts`. The regression command narrows which
spec files run; it does not change test definitions or database fixtures.

To confirm which tests will run without starting the servers:

```powershell
npx playwright test --config playwright.regression.config.ts --list
```

## CI

`.github/workflows/frontend-tests.yml` already executes `npm run test:e2e` on
pushes and pull requests. That full browser suite includes **all four** selected
regression specs, so changes to these critical journeys are already blocked by
CI failures. The dedicated `test:regression` command provides a quicker way to
rerun only these journeys locally. CI retains its existing broader coverage.

## Failure diagnostics

Playwright uses `trace: retain-on-failure` and CI uploads `test-results` and
`playwright-report` as the `playwright-results` artifact. Inspect those reports
when a journey fails. Do not rerun tests against a real Supabase instance.
