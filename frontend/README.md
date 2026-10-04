# CampusConnect frontend

Next.js App Router and TypeScript with Supabase browser/server clients and session refresh.
The existing `profile.html` is preserved as a legacy file; it is not the Next.js homepage.
The Java backend remains separate in `../backend`.

## Run locally

Use Node.js 22 or newer. From the repository root:

```bash
cd frontend
npm ci
```

The local `.env` was created during setup. For a fresh clone, copy `.env.example` to `.env`.
Open your Supabase project's **Connect** dialog and fill in these values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Use the publishable key, not a secret key or legacy service-role key. `NEXT_PUBLIC_`
values are included in browser code. The helpers expect the new `sb_publishable_` key.
`.env` and all local environment variants are ignored by Git; `.env.example` contains
only blank placeholders and can be committed. Do not commit credentials.

```bash
npm run dev
```

Open <http://localhost:3000> and select **Check connection**. Restart the development
server after changing `.env`. Remove conflicting values from `.env.local` if you
previously created one: Next.js gives it priority over `.env`.
For production, fill in the variables before `npm run build`; public environment
values are embedded during compilation, so changing them requires a new build.

The connection check reads `/auth/v1/settings`; it does not create users, tables,
or domain restrictions. A successful check verifies that the Auth endpoint accepts
your project details, not that registration, email delivery, or database policies work.

## Connection files

- `src/lib/supabase/config.ts`: validates the URL and publishable key.
- `src/lib/supabase/client.ts`: browser client for Client Components.
- `src/lib/supabase/server.ts`: cookie-based client for Server Components, Server Actions, and Route Handlers.
- `src/lib/supabase/proxy.ts` and `src/proxy.ts`: validate/refresh existing sessions without adding access rules.
- `src/app/api/supabase/health/route.ts`: read-only connectivity check.

In browser code, import `createClient` from `@/lib/supabase/client`.
In server code, import it from `@/lib/supabase/server` and await it.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Stop point: ready for SCRUM-82

Once the connection succeeds, confirm the exact allowed university email domains
with the team. The next work is **SCRUM-82: university-domain restriction**, enforced
in Supabase Auth through a Before User Created hook. That task has not been implemented.

Registration, verification emails/pages, unverified-account handling, database tables,
role guards, and GitHub test automation are also outside this setup.

Later, keep **Confirm Email** enabled, configure local Auth redirect URLs, and arrange
custom SMTP for verification emails to addresses outside the Supabase organization's
team. These belong to the authentication tasks rather than connection setup.

References:
- <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- <https://nextjs.org/docs/app/guides/environment-variables>
- <https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook>
- <https://supabase.com/docs/guides/auth/auth-smtp>
