# CampusConnect

One shared Next.js application with Supabase, running from the repository root.
The profile page is at `/`; the read-only Supabase connection checker is at `/setup`.
The current profile page uses mock data, as in the team's migration.

## Run locally

Use Node.js 22 or newer. Run these commands from the repository root:

```bash
npm ci
```

For a fresh clone, copy `.env.example` to `.env`. Your existing local `.env` was
preserved when the two app setups were combined. Fill in your project's **Connect** details:

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

- `lib/supabase/client.ts`: browser client for Client Components.
- `lib/supabase/server.ts`: cookie-based client for server components, actions, and route handlers.
- `lib/supabase/config.ts`: project URL and publishable-key validation.
- `lib/supabase/proxy.ts` and `proxy.ts`: validate and refresh existing sessions.
- `app/api/supabase/health/route.ts`: read-only connectivity check.

Import `createClient` from `@/lib/supabase/client` in browser code. Import it from
`@/lib/supabase/server` in server code and await it. Session refresh does not add
role guards, registration, or unverified-login redirects.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Next task

The setup stops before **SCRUM-82: university-domain restriction**. Confirm the
accepted university domains, then implement a Supabase Before User Created hook.
Keep email confirmation enabled and arrange custom SMTP for university inboxes
outside the Supabase organization's team during the verification-email task.

See [SETUP_REPORT.md](SETUP_REPORT.md) for the setup and merge reconciliation report.

References:
- <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- <https://nextjs.org/docs/app/guides/environment-variables>
- <https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook>
