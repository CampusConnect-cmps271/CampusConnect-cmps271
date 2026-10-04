# CampusConnect

One shared Next.js application with Supabase, running from `frontend/`.

| Route | What |
| --- | --- |
| `/` | Landing page |
| `/login` | Placeholder until the login page (SCRUM-107) lands |
| `/forgot-password` | Request a reset code, then choose a new password |
| `/profile` | Student profile (mock data) |
| `/setup` | Read-only Supabase connection checker |
| `POST /api/auth/forgot-password` | Emails a password-recovery code |
| `POST /api/auth/reset-password` | Verifies the code and sets the new password |

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

Open <http://localhost:3000> for the landing page or <http://localhost:3000/setup> to
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
npm test        # all tests: API tests (Vitest, Supabase mocked) + university-domain tests
npm run lint
npm run typecheck
npm run build
```

Run one suite with `npm run test:api` or `npm run test:domain`.

Manual API tests (Postman collection and test-case list) are in [`api-tests/`](api-tests/README.md).

## Password recovery: Supabase settings

`/forgot-password` uses Supabase's built-in recovery code. In the Supabase Dashboard:

1. **Authentication → Email Templates → Reset Password**: include the code with `{{ .Token }}`, for example
   `<p>Your CampusConnect reset code is: <strong>{{ .Token }}</strong></p>`.
2. **Authentication → Providers → Email → Password requirements**: minimum length **8**, requiring
   lowercase, uppercase, digits and symbols. This matches `lib/validation.ts`.
3. Use custom SMTP before real use. The built-in mailer only sends a few emails per hour.

The flow never reveals whether an email is registered. After a successful reset, every existing
session for that user is signed out.

## Deployment (dev environment)

- **Vercel**: import the repo, set **Root Directory** to `frontend`, and add the two
  `NEXT_PUBLIC_SUPABASE_*` variables.
- **AWS Amplify**: use [`amplify.yml`](amplify.yml), which builds `frontend/` and runs the tests first.

Then add the deployed URL under Supabase **Authentication → URL Configuration**, and run the
Postman collection against it by setting the `baseUrl` variable.

## Next task

**SCRUM-82: university-domain restriction** is implemented locally for the agreed
`mail.aub.edu` domain. Apply the SQL migration and enable the Before User Created
hook in Supabase using [the activation instructions](supabase/README.md).
You reported applying the migration and enabling the hook. Rerun the updated
SQL checks to validate the function, then test through the signup flow when ready.
Keep email confirmation enabled for the subsequent verification tasks.

See [SETUP_REPORT.md](SETUP_REPORT.md) for the setup and merge reconciliation report.

References:
- <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- <https://nextjs.org/docs/app/guides/environment-variables>
- <https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook>
