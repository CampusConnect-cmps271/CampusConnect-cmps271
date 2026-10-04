# Supabase setup and merge reconciliation report

Date: October 4, 2026

> Current layout: the Next.js application and environment files now live in
> `frontend/`; run npm commands there. The sections below record the earlier
> merge reconciliation and its root-app layout, not the current Git state.
> SCRUM-82 is now prepared locally for `mail.aub.edu`; see
> [the task setup and activation instructions](supabase/README.md).

## SCRUM-82 implementation update

The accepted domain is `mail.aub.edu`, matched case-insensitively. The new migration
in `supabase/migrations/` creates a Before User Created function that rejects
other domains, malformed domain inputs, and missing emails. Auth metadata cannot
override the checked email. Only the Supabase Auth database role can execute it;
anonymous and authenticated clients cannot call it directly.

The new `supabase/tests/university_domain.sql` exercises 22 input cases without
creating users. `frontend/tests/university-domain.test.mjs` runs the real migration
and those checks in PGlite, and checks permissions and safe migration reapplication.
PGlite was added as a development dependency; `npm test` runs the suite.

Validation passed for the initial implementation: five automated tests covering the 22 SQL cases, role permissions,
and migration reapplication; ESLint; TypeScript checking; and the production build.
Checksums confirm the local environment files, profile page, and layout are unchanged.
The environment files remain ignored by Git. README commands now use `frontend/`.

No cloud hook was installed or enabled, and no Supabase users or tables were created.
Follow [the activation guide](supabase/README.md) to finish the cloud configuration.
There were no commits, staging operations, or pushes during this task. The merge
details below describe the earlier reconciliation only.

### SQL Editor test correction

You reported installing the migration and enabling the hook in your project.
The first dashboard test attempt failed because the test script used
`SET LOCAL ROLE supabase_auth_admin`, which the hosted SQL Editor role cannot do.
The shared SQL script now runs as the default SQL Editor role and inspects the
required permissions instead. Local tests still execute the domain cases as Auth's
role and additionally reproduce a dashboard role without Auth-role membership.
The migration, signup restriction, and grants are unchanged. Rerun the updated
SQL checks to validate the installed function; live signup testing is still pending.
All six updated local tests and ESLint passed after this correction.

## What happened

Local `main` had commit `08cd36e` (the Supabase setup), while `origin/main` had
commit `1be9e99` (the teammate's Next.js profile migration). Both descended from
`b9fbf65`. The branches diverged by one commit each. The overlapping Git conflicts
were in `.gitignore` and `README.md`; keeping both versions unchanged would also
have left two separate Next.js applications.

A local backup branch, `backup/supabase-setup-before-merge`, preserves the original
local setup commit. The latest remote work was fetched and merged with `--no-commit`.
The resolved merge is staged for your manual commit. No commit or push was performed
by the assistant during this reconciliation.

## Combined application

The repository root is now the single shared Next.js app, following the teammate's
migration. Run npm commands from the root, rather than from `frontend/`.

- `/`: the teammate's existing mock Student Profile page.
- `/setup`: the read-only Supabase connection checker.
- `/api/supabase/health`: checks the project's public Auth settings using a GET request.
- `lib/supabase/`: browser/server clients, configuration validation, and session refresh.
- `proxy.ts`: wires session refresh into Next.js without introducing role guards or login redirects.

The teammate's profile UI and edit/save behavior are retained. An unused state setter
was removed to keep lint clean, and trailing whitespace was cleaned up. The shared layout, Tailwind styles, fonts, favicon,
public assets, TypeScript alias, and Next.js configuration were retained.

The teammate intentionally removed the legacy Java backend and plain HTML profile
as part of the migration. Those removals are included in the merge. Their previous
tracked versions remain available in Git history and the backup branch.

## Changes made during reconciliation

| File or area | Resolution |
| --- | --- |
| `.gitignore` | Combined Next.js, generated-build, editor, and local configuration rules; `.env` stays ignored and `.env.example` is allowed. |
| `README.md` | Replaced conflicting instructions with one set of root-app commands and connection instructions. |
| `.env` | Moved the existing local file from `frontend/.env` to the root without changing its contents or owner-only permissions. |
| `.env.example` | Moved the blank template to the root and updated its comments. |
| `package.json` | Kept the shared application's dependency choices; added Supabase SSR, type checking, an explicit lint target, and Node.js 22 guidance. |
| `package-lock.json` | Regenerated for the shared application's combined dependencies. |
| `lib/supabase/config.ts` | Moved configuration validation into the shared application; updated the environment-file location. |
| `lib/supabase/client.ts` | Moved the browser client into the shared application. |
| `lib/supabase/server.ts` | Moved the cookie-based server client into the shared application. |
| `lib/supabase/proxy.ts` and `proxy.ts` | Moved session refresh helpers into the shared application. |
| `app/api/supabase/health/route.ts` | Moved the read-only connectivity endpoint into the shared application. |
| `app/setup/page.tsx` and `connection-check.tsx` | Moved the setup screen away from the profile homepage. |
| `app/setup/setup.module.css` | Scoped setup styles so they do not change the teammate's profile page. |
| `app/page.tsx` | Preserved the profile feature; removed only its unused loading-state setter. |
| `frontend/` source/configuration files | Removed the duplicate app after moving its useful connection code to the shared application. |
| `SETUP_REPORT.md` | Updated this report to reflect the shared application and merge. |

The already-installed dependency directory was moved to the app root and updated.
Old generated frontend artifacts were preserved outside the repository at
`/tmp/campusconnect-frontend-generated-backup`. They are not staged.

An accidental untracked file named `frontend and Supabase connection"` contained only
Git's staged-file listing. It was preserved at
`/tmp/campusconnect-accidental-git-output.txt` and excluded from the merge.

## Environment configuration

Your environment file is now **`.env` at the repository root**. Existing values were
preserved, and the file is still ignored by Git. It is not part of the staged merge.
For a fresh clone, copy `.env.example` to `.env` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Use the publishable key from Supabase's Connect dialog. `NEXT_PUBLIC_` values are
visible in browser applications; never place secret/service-role keys there.
Restart the development server after changing `.env`. Public values are embedded
at build time for production, so production changes require rebuilding.

## Running the shared app

From the repository root:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000> for the profile or <http://localhost:3000/setup> to check
Supabase connectivity. The connection check does not create users, tables, or hooks,
and does not verify email delivery or database policies.

## Next-task boundary

**SCRUM-82: university-domain restriction remains unimplemented.** Confirm the exact
allowed university domains before implementing the Supabase Before User Created hook.
Registration, verification emails/pages, role guards, and GitHub test automation are
also outside this reconciliation.

## Verification

- `npm run lint`: passed without warnings or errors.
- `npm run typecheck`: passed.
- `npm run build`: passed for the profile, `/setup`, health endpoint, and session proxy.
- Six local runtime smoke checks passed: existing profile/setup pages and missing
  configuration; secret-key rejection; successful Auth settings read; rejected
  credentials; unexpected response; and unreachable project.
- Tests used dummy values and a local mock server. No real cloud data was modified,
  and all temporary test servers were stopped.
- Local `.env` checksum and owner-only permissions are unchanged; Git ignores it
  and allows the blank `.env.example`.
- The shared package manifest and lockfile match.
- Teammate layout, global styles, Next.js/PostCSS configuration, and TypeScript
  configuration are byte-for-byte unchanged from the remote commit.
- A final fetch confirmed `origin/main` still matches the commit being merged.

## Finish the merge manually

The conflicts are resolved and the changes are staged. Run from the repository root:

```bash
git status
git commit -m "Merge main and integrate Supabase connection setup"
git push origin main
```

This completes the merge while retaining both contributors' commits. A normal push
is sufficient; no force push is needed. No push has been performed by the assistant.

## Dependency audit

The production dependency audit reports zero vulnerabilities. The full audit still
reports five high-severity entries from one unpatched development-only `braces`
advisory through Next.js's ESLint dependencies. A forced downgrade of the Next.js
lint configuration was not applied. See the
[upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## References

- [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- [University-domain enforcement](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
