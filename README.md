# CampusConnect

An AI-powered campus community platform for AUB. CMPS 271 team project.

One deployable Next.js app, organised as a modular monolith.

| Folder | Holds |
| --- | --- |
| `frontend/` | the Next.js app — pages, modules, and all server-side code |
| `supabase/` | database config, migrations and SQL tests |
| `backend/` | reserved; App Router server code lives in `frontend/` for now |

**Run npm commands from `frontend/`.** The Supabase CLI works from there too —
it searches upward and finds `supabase/` at the repository root.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 ·
Supabase (Postgres + Auth).

## Getting started

### 1. Prerequisites

- **Node.js 22 or newer** (`node --version`)
- **Docker Desktop, running.** The local Supabase stack runs in Docker; if
  Docker is not up, `supabase start` fails.

### 2. Install

```bash
cd frontend
npm install
```

### 3. Point the Supabase CLI at your local URLs

From the repository root:

```bash
cp supabase/.env.example supabase/.env
```

`supabase/config.toml` reads its auth URLs from here through `env(...)`, so the
same file can configure both local and the hosted project. Do this **before**
starting Supabase — the CLI reads it at start-up.

This file is for the CLI only. The app's own variables go in `frontend/.env.local`
(step 5).

### 4. Start Supabase locally

```bash
npx supabase start
```

First run downloads the Docker images and takes a few minutes. It prints the
local URLs and keys; `npx supabase status` reprints them any time.

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:54321 |
| Studio (database UI) | http://127.0.0.1:54323 |
| **Mailpit (auth emails land here)** | http://127.0.0.1:54324 |

No auth email ever leaves your machine in local development — confirmation and
password-reset links all arrive in Mailpit.

### 5. Configure the app environment

```bash
cp .env.example .env.local
```

Fill `.env.local` from `npx supabase status`: `NEXT_PUBLIC_SUPABASE_URL` is the
API URL, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is `PUBLISHABLE_KEY`, and
`SUPABASE_SECRET_KEY` is `SECRET_KEY`. Legacy `ANON_KEY` / `SERVICE_ROLE_KEY`
JWTs work too.

`.env.local` is never committed. `.env.example` holds placeholders only — keep
real keys out of it.

### 6. Create the test student

```bash
npm run seed:test-user
```

Creates a confirmed account from `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`. Safe
to re-run: it resets the password and confirmation instead of failing. It
refuses to run against anything but a local Supabase.

### 7. Run the app

```bash
npm run dev
```

- http://localhost:3000 — landing page
- http://localhost:3000/register — sign up
- http://localhost:3000/verify-email — enter the verification code
- http://localhost:3000/login — log in
- http://localhost:3000/forgot-password — reset a forgotten password
- http://localhost:3000/profile — profile page (mock data)
- http://localhost:3000/home — protected placeholder home
- http://localhost:3000/setup — Supabase connection checker

### Signing up

Verification is by **8-digit code**, not a confirmation link. Sign up at
`/register`, open the email in Mailpit, then enter the code at `/verify-email`
(the address is carried across for you). **Resend code** starts a 60-second
countdown. Only then can the account log in.

`supabase/config.toml` points the confirm-signup email at
`supabase/templates/confirmation.html`, the same template saved on the hosted
project, so local and hosted send the same thing.

### Resetting a password

Password recovery is also by **8-digit code** (SCRUM-26). From **Forgot
password?** on `/login` (or **Reset your password** on the landing page), a
student enters their email, receives a code, and sets a new password on
`/forgot-password`. Every existing session for that account is then signed out.

- The API is `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`
  (`frontend/app/api/auth/`, logic in `frontend/lib/auth/password-reset.ts`).
- Responses never reveal whether an email is registered.
- The new password is checked against `modules/auth/password.ts`, the same
  policy as sign-up.
- `supabase/config.toml` points the reset email at
  `supabase/templates/recovery.html`. The hosted project's **Authentication →
  Emails → Reset Password** template must also contain `{{ .Token }}`. It does
  now; without it Supabase sends a link instead of a code.

### Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm test` | Everything: unit tests then database tests |
| `npm run test:unit` | Unit tests only (Vitest), including the password-reset API tests in `tests/api/` |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:db` | SQL/migration tests (pglite, no Docker needed) |
| `npm run test:e2e` | Browser tests (Playwright); not part of `npm test` |
| `npm run build` | Production build |
| `npm run seed:test-user` | Create/reset the local test student |
| `npx supabase start` / `stop` | Local Supabase stack |
| `npx supabase status` | Local URLs and keys |

Run lint, typecheck, tests and build before pushing.

The browser tests use mocked Auth responses and a separate local server with
test-only connection values; they send no email and create no accounts. Install
the browser once, then run them:

```bash
npx playwright install chromium
npm run test:e2e
```

If Google Chrome is already installed,
`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` uses that instead.

## Project structure

```
frontend/
  app/                routes only; pages stay thin
    (protected)/      route group gated by requireUser()
    login/
  modules/<name>/     feature modules; index.ts is the public API
    auth/
      components/
  lib/
    headers.ts        request headers the proxy adds
    supabase/         client.ts, server.ts, proxy.ts, config.ts
  scripts/            one-off maintenance scripts
  components/         landing-page sections (Navbar, Hero, FAQ, …)
  lib/auth/           password-reset logic behind /api/auth/*
  tests/              database tests (pglite) and API route tests (tests/api/)
  proxy.ts            app proxy; refreshes the session per request
supabase/
  config.toml         local stack and auth settings
  .env.example        values config.toml reads through env(...)
  migrations/         every schema change, in order
  tests/              SQL checks you can paste into the SQL Editor
  README.md           SCRUM-82 university-domain hook: how to activate it
```

### Import rules

- **Import a module through its public API: `@/modules/auth`, never
  `@/modules/auth/session`.** Each module's `index.ts` is the contract; the
  files behind it are free to move.
- Routes in `app/` stay thin. A page composes; the logic lives in a module.
- Server-only files start with `import "server-only"` so they fail the build
  instead of leaking into a client bundle.
- A Client Component must not import a module barrel that re-exports
  server-only code. Inside a module, client files import their siblings
  directly.
- One exception, for `logging`: its barrel is server-only, so a Client
  Component imports **`@/modules/logging/client`** instead. That is a second
  public entry, not a reach into private files.

### Logging

Every entry lands in `public.app_logs`, which has RLS on and no policies, so
only server code holding the secret key can read or write it. Rows older than
14 days are removed nightly by a `pg_cron` job.

```ts
import { log } from "@/modules/logging";          // server
log.info("auth.login.success", { email }, { userId });

import { logClient } from "@/modules/logging/client"; // browser -> POST /api/log
```

Context is redacted before it is stored — on the client, and again on the
server for anything the browser sends. Passwords, tokens, cookies, secrets and
message bodies are dropped, emails are masked, and long strings truncated.
Never defeat that by pasting a secret into an event name or message.

### Supabase clients

Pick by where the code runs:

| File | Use from |
| --- | --- |
| `lib/supabase/client.ts` | Client Components (browser) |
| `lib/supabase/server.ts` | Server Components, Server Actions, Route Handlers |
| `lib/supabase/proxy.ts` | the root `proxy.ts` only |

Create a new server client per request; never share one. Identify the user with
`supabase.auth.getClaims()` or `getUser()` — never `getSession()`, which trusts
the cookie without verifying it.

### Database changes

Every schema change is a SQL migration in `supabase/migrations/`:

```bash
npx supabase migration new <name>   # then edit the generated file
npx supabase db reset               # replay all migrations locally
```

Never edit the local database by hand without a migration, or teammates cannot
reproduce it.

### Roles and permissions (SCRUM-16)

Roles live in `user_roles`, with helpers in `frontend/lib/auth/`. If that
migration has not been applied, the profile still loads and role-protected
features stay unavailable; apply it with
[the roles setup instructions](supabase/README.md).

### University-domain restriction (SCRUM-82)

Sign-up is limited to `@mail.aub.edu` by a Before User Created hook. The
migration creates `public.hook_restrict_university_email`; activating it as the
hook is a separate step, covered in [supabase/README.md](supabase/README.md).

It is enabled on the hosted project. **It is not yet wired up locally** —
`config.toml` does not declare `[auth.hook.before_user_created]`, so the
function exists locally but does not run. Until it does, local sign-up is
restricted only by the app's own validation, and local and hosted behave
differently.

## API tests (SCRUM-22)

- **Automated:** `npm run test:unit` runs `frontend/tests/api/`. These tests
  call the route handlers with Supabase mocked, so they need no keys and send
  no email.
- **Manual:** [`api-tests/`](api-tests/README.md) has a Postman collection
  with 20 cases and the expected result of each. Point its `baseUrl` at a local
  or deployed app.

## Deployment (SCRUM-115)

- **Vercel:** import the repo, set **Root Directory** to `frontend`, and add
  the `NEXT_PUBLIC_*` and `SUPABASE_SECRET_KEY` variables from
  `frontend/.env.example`.
- **AWS Amplify:** [`amplify.yml`](amplify.yml) builds `frontend/` and runs the
  tests first. Set the same environment variables in the console.

Then add the deployed URL under Supabase **Authentication → URL Configuration**.

## Background

[SETUP_REPORT.md](SETUP_REPORT.md) records the original Supabase setup and the
merge that combined the two app folders.

## AI assistance

Parts of this project were written with Claude Code, as declared per the course
requirement.
