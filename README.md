# CampusConnect

An AI-powered campus community platform for AUB. CMPS 271 team project.

One deployable Next.js app, organised as a modular monolith. The app lives in
`frontend/`, so **every command below runs from `frontend/`**.

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

### 3. Start Supabase locally

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

### 4. Configure the environment

```bash
cp .env.example .env.local
```

Fill `.env.local` from `npx supabase status`: `NEXT_PUBLIC_SUPABASE_URL` is the
API URL, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is `PUBLISHABLE_KEY`, and
`SUPABASE_SECRET_KEY` is `SECRET_KEY`. Legacy `ANON_KEY` / `SERVICE_ROLE_KEY`
JWTs work too.

`.env.local` is never committed. `.env.example` holds placeholders only — keep
real keys out of it.

### 5. Create the test student

```bash
npm run seed:test-user
```

Creates a confirmed account from `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`. Safe
to re-run: it resets the password and confirmation instead of failing. It
refuses to run against anything but a local Supabase.

### 6. Run the app

```bash
npm run dev
```

- http://localhost:3000 — profile page (mock data)
- http://localhost:3000/login — log in
- http://localhost:3000/home — protected placeholder home
- http://localhost:3000/setup — Supabase connection checker

### Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm test` | Unit tests (Vitest, single run) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run build` | Production build |
| `npm run seed:test-user` | Create/reset the local test student |
| `npx supabase start` / `stop` | Local Supabase stack |
| `npx supabase status` | Local URLs and keys |

Run lint, typecheck, tests and build before pushing.

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
  supabase/           config.toml and migrations/
  proxy.ts            root proxy; refreshes the session per request
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

## AI assistance

Parts of this project were written with Claude Code, as declared per the course
requirement.
