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
| SCRUM-87 | Current landing page, login form and password toggle, required-field/domain validation, login/logout, protected visits, safe destinations, confirmed/unconfirmed authentication | Revisit assertions when these pages change |
| SCRUM-99 | Registration, email verification, password-recovery APIs/client isolation and browser flow, role lookup fallback and roles/RLS migrations | Hosted recovery delivery is a separate manual smoke test |
| SCRUM-111 | GitHub workflow for all unit, database and browser suites, plus lint, types and build | The workflow's earlier run passed on `c9e034a`; these new checks will run after the user's manual push |
| SCRUM-183 | Signed-out `/profile` redirect; profile edits validated inline, saved and kept after reload; name shown on `/home`; labelled fields at phone width; read-only `/profile/[id]`, own-id redirect and 404s | The mock fixture stands in for PostgREST; RLS, grants and triggers are covered by `tests/profiles.test.mjs` |
| SCRUM-59 | Message from a profile and a post (none on your own), same conversation on repeat; sending, counter and the 2000 limit; plain-text multi-line and long messages at phone width; inbox unread dot and header count cleared on open; 404 for a third student; header at phone width | Realtime is not mocked: live delivery and RLS on Realtime were checked by hand on the local stack. RLS, grants and functions are covered by `tests/messaging.test.mjs` |
| SCRUM-60 | Several messages make one unread notification; bell count, panel, Escape and focus, opening lands in the conversation and clears it; Mark all as read; phone link to `/notifications`; another student sees none | Realtime and comment/removal notifications were checked by hand on the local stack; triggers, collapsing and RLS are covered by `tests/notifications.test.mjs` |

## Password recovery (SCRUM-99)

Latest validation after integrating PR #5 (`ee5b43c`): **178 Vitest tests,
24 Node database/helper tests and 29 Playwright tests passed (231 total)**,
along with lint, type checking and production build. The browser suite, lint
and build were rerun after the latest pull; the unit/database suites are
unchanged from their previous passing run. Counts include preserved
teammate tests. SCRUM-99's current implementation scope is complete locally;
the new GitHub Actions result will follow the user's manual commit and push.

The suite preserves Ameera's API/validation tests and extends them with missing
session/configuration checks, provider failures, rate limits, JSON body rejection,
normalization, exact password preservation, SDK call ordering and no browser
session cookie on reset. The stateless client tests check fresh client creation,
disabled persistence/refresh and rejection of a public secret key.

`tests/e2e/password-recovery.spec.ts` exercises the real Next.js API routes and
Supabase SDK against the local Auth fixture. It covers code requests, reset,
one-time replay rejection, old-password rejection/new-password login, neutral
unknown-account messages, mobile form validation, password visibility, invalid
or expired codes, provider/rate errors, resending, changing email and network
failure recovery. Per-email fixture state keeps parallel tests independent.

The fixture models code consumption and password changes; it does not prove
hosted Supabase behavior or email delivery. No real mailbox or account is used.
The reset requests global sign-out after updating the password. Revoking refresh
tokens does not immediately invalidate already-issued access JWTs; they remain
valid until expiry, as described in [Supabase's sign-out reference](https://supabase.com/docs/reference/javascript/auth-signout).

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
