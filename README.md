# CampusConnect

One shared Next.js application with Supabase, running from `frontend/`.
The profile page is at `/`; the read-only Supabase connection checker is at `/setup`.
The university verification page is at `/verify-email`.
The current profile page uses mock data, as in the team's migration.

## Run locally

Use Node.js 22 or newer. Run these commands from the repository root:

```bash
cd frontend
npm ci
```

For a fresh clone, copy `frontend/.env.example` to `frontend/.env` (or
`.env.example` to `.env` if already inside `frontend/`). Fill in your project's **Connect** details:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Use the publishable key, not a secret/service-role key. The connection helpers expect
an `sb_publishable_` key. `NEXT_PUBLIC_` values are visible in browser code.
`.env` and its local variants are ignored by Git; the blank `.env.example` can be committed.

```bash
npm run dev
```

Open <http://localhost:3000> for the profile or <http://localhost:3000/setup> to
check the Supabase connection. The connection check reads Auth settings without
creating users, tables, or authentication hooks. It does not verify email delivery
or database policies. Restart the development server after changing `.env`; remove
conflicting values from `.env.local` if it exists, since it has priority.
For production, set variables before `npm run build`; changing public variables
requires rebuilding.

## Supabase helpers

These paths are relative to `frontend/`:

- `lib/supabase/client.ts`: browser client for Client Components.
- `lib/supabase/server.ts`: cookie-based client for server components, actions, and route handlers.
- `lib/supabase/config.ts`: project URL and publishable-key validation.
- `lib/supabase/proxy.ts` and `proxy.ts`: validate and refresh existing sessions.
- `app/api/supabase/health/route.ts`: read-only connectivity check.

Import `createClient` from `@/lib/supabase/client` in browser code. Import it from
`@/lib/supabase/server` in server code and await it. Session refresh does not add
role guards, registration, or unverified-login redirects.

## Checks

Run from `frontend/`:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Verification browser tests use mocked Auth responses and a separate local server
with test-only connection values; they do not send real email or create accounts.
From `frontend/`, install the test browser once and run:

```bash
npx playwright install chromium
npm run test:e2e
```

If Google Chrome is already installed, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`
uses that browser instead.

## Verification page

Open <http://localhost:3000/verify-email>. Enter the university email used at signup
and the eight-digit code from the latest confirmation email. **Resend code** requests
an existing signup confirmation and starts a 60-second countdown. Wrong/expired
codes, rate limits, and connection failures show an error without leaving the page.
Successful verification saves the Supabase session through the existing browser
client, then offers **Continue to CampusConnect**.
If the SCRUM-16 roles migration has not been applied yet, the profile still loads
and role-protected features remain unavailable. Apply the migration using
[the roles setup instructions](supabase/README.md#scrum-16-roles-and-permissions)
to enable assigned roles.

After successful signup with no session, the registration form should navigate to
`/verify-email?email=${encodeURIComponent(email)}` to prefill the email. Direct
visits also work. The page does not create accounts. See
[the verification guide](supabase/VERIFICATION_EMAIL.md) for integration and live testing.

## Next task

**SCRUM-82: university-domain restriction** is implemented locally for the agreed
`mail.aub.edu` domain. Apply the SQL migration and enable the Before User Created
hook in Supabase using [the activation instructions](supabase/README.md).
You reported applying the migration, enabling the hook, and passing the SQL checks.
SCRUM-94's email delivery test passed using Gmail custom SMTP and the saved code
template. The recipient confirmed the expected subject and an eight-digit code;
the email arrived in Junk. See [the verification email guide](supabase/VERIFICATION_EMAIL.md)
for setup and test details. SCRUM-106 is Done in Jira: the user reported live
verification success, and the complete return-to-profile regression test passed
after the missing-roles-table fix. Next is SCRUM-116's
unverified-login redirect, coordinated with the login owner. Keep email confirmation enabled.

See [SETUP_REPORT.md](SETUP_REPORT.md) for the setup and merge reconciliation report.

References:
- <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- <https://nextjs.org/docs/app/guides/environment-variables>
- <https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook>
