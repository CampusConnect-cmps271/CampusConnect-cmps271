# Authentication tests and GitHub checks

## Running locally

From `frontend/`, using Node 22 or newer:

```bash
npm ci
npm run lint
npm run typecheck
npm test
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
npm run build
```

If Chrome is not installed, run `npx playwright install chromium`, then
`npm run test:e2e` without `PLAYWRIGHT_CHANNEL`. Browser tests start their own
frontend at port 3100 and a local Supabase fixture at port 3101. Stop other Next
development servers for this checkout first: they share `.next/dev`'s lock.

Tests use synthetic accounts, passwords, keys and tokens. They never create a
real account, change a real role, or send an email. PGlite database tests run in
memory and need no Docker or hosted Supabase credentials.

## Coverage

| Task | Covered behavior | Remaining dependency |
| --- | --- | --- |
| SCRUM-116 | The existing login Server Action redirects `email_not_confirmed` to code entry; normal credential errors stay on login; verified users reach `/home`; unverified sessions cannot access protected home, role pages or role assignment | Optional manual smoke test with an existing unverified AUB account |
| SCRUM-87 | Current root/landing page renders, login form and password toggle, required-field/domain validation, login/logout, protected visits, safe destinations, confirmed/unconfirmed authentication | Revisit landing assertions when the current profile placeholder is replaced |
| SCRUM-99 | Registration schema and action, duplicates and email rate limits, code validation/resending, confirmed session checks, current mock profile edits, role lookup fallback and roles/RLS migrations | Password recovery is absent; profile checks cover local mock state, not future database persistence |
| SCRUM-111 | GitHub workflow for all unit, database and browser suites, plus lint, types and build | Push the workflow and check its first GitHub Actions run |

The existing profile labels are not associated with their inputs. Its browser
test selects the current fields by position without changing that teammate's
implementation. Update those selectors when profile accessibility is improved.

## GitHub workflow

`Frontend checks` runs on every push and pull request, and can also be started
manually from GitHub's **Actions** tab. Two independent jobs run:

- **Lint, types, unit/database tests and build** installs from the frontend
  lockfile with Node 22 and checks the code.
- **Browser tests** installs Chromium and runs the full Playwright suite against
  local fixtures. HTML results and failure traces are retained for seven days.

The workflow needs only read access to the repository and has no deployment,
commit or push step. No real Supabase or SMTP keys are configured in it.
Playwright rejects focused `test.only` cases in CI.

Implementation references: [Supabase Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes),
[trusted current-user lookup](https://supabase.com/docs/reference/javascript/auth-getuser),
and [Playwright CI setup](https://playwright.dev/docs/ci-intro).
