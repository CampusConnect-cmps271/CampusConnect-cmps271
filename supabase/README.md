# SCRUM-82: university-domain restriction

The agreed signup domain is **`mail.aub.edu`**. Matching is case-insensitive:
`student@mail.aub.edu` and `student@MAIL.AUB.EDU` pass. Other domains,
`aub.edu`, subdomains, lookalikes, missing email addresses, and whitespace fail.
Supabase still validates the rest of the email address syntax.

The hook checks the Auth user's email, never user-supplied metadata. It runs in
Supabase before account creation, so direct signup API calls receive the same
restriction as the future registration page. No registration UI is added here.

## Activate in your Supabase project

You reported applying the migration and enabling the cloud hook. The domain checks
and an end-to-end signup check still need to confirm its behavior in your project.
For another project, use the installation steps below.

1. In your project's **SQL Editor**, run the complete contents of
   [the migration](migrations/20261004000000_restrict_university_signup.sql).
   It creates the function and grants execution to `supabase_auth_admin`, while
   denying direct execution to `anon`, `authenticated`, and `PUBLIC`.
2. Run [the SQL checks](tests/university_domain.sql) in the same SQL Editor.
   An exception means a failed check; successful completion passes all 22 cases.
   Use the default SQL Editor role (normally `postgres`). The checks inspect Auth
   permissions without switching to `supabase_auth_admin`, which hosted SQL Editor
   sessions cannot do. They create no users and roll back their transaction.
3. Open **Authentication → Auth Hooks**, add or select **Before User Created**,
   choose a **Postgres function**, and select
   `public.hook_restrict_university_email`. Save and enable it. If a Before User
   Created hook already exists, review it before replacing it; Supabase uses one
   hook for this event, so any existing checks need to be combined.
4. Check the enabled hook selection in the dashboard. Once the registration
   flow is available, verify that a non-university signup is rejected and an
   unused `@mail.aub.edu` address can proceed. The local SQL tests check the
   function; they do not prove the cloud hook is enabled.

No admin credentials belong in `frontend/.env`. The existing project URL and
publishable key connect the frontend; they cannot install this database function.

## Run locally

From the repository root:

```bash
cd frontend
npm ci
npm test
npm run lint
npm run typecheck
```

The Node test runner executes the actual migration and SQL checks in an in-memory
PostgreSQL engine (PGlite), without connecting to your Supabase project. Tests also
check denied access for anonymous, authenticated, and unrelated database roles,
verify that reapplying the migration preserves permissions and behavior, and
reproduce the dashboard's role-switch restriction to check the SQL Editor script.

## Scope and next tasks

This restriction applies when creating **new users**. It does not remove existing
accounts or enforce email changes on existing accounts. It does not prove inbox
ownership; keep email confirmation enabled for the verification work.

After activation, coordinate with the registration owner to display the returned
Auth error. Then continue with **SCRUM-94: verification email**, followed by the
verification page and unverified-account handling. Verify confirmation settings,
redirect URLs, and SMTP before testing real university email delivery.

References: [Supabase Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook),
[hook permissions and configuration](https://supabase.com/docs/guides/auth/auth-hooks),
[PGlite documentation](https://pglite.dev/docs/).

## SCRUM-16: roles and permissions

Run `migrations/20261005010000_roles_and_permissions.sql` in the Supabase SQL
Editor after the signup-domain migration. It creates the four application roles,
assigns `student` to new and existing accounts, enables row-level security, and
adds administrator-only functions for listing users and changing roles.

The migration intentionally does not guess who the first administrator is. After
reviewing the target account in **Authentication → Users**, bootstrap exactly one
trusted administrator by running this once with the real account email:

```sql
update public.user_roles as roles
set role = 'administrator', updated_at = now()
from auth.users as users
where roles.user_id = users.id
  and lower(users.email) = lower('ADMIN_EMAIL@mail.aub.edu');
```

Confirm that the statement reports one updated row. Administrators can then use
`/admin` to assign the `student`, `club_representative`, `moderator`, or
`administrator` role. Do not use a service-role key in the frontend; authorization
is enforced by Supabase RLS and security-definer functions using the signed-in user.

Run `tests/roles_permissions.sql` in the SQL Editor for non-destructive schema and
permission checks. The local Node test suite additionally verifies new-user defaults,
role lookup, rejected non-admin changes, administrator search/assignment, and safe
migration reapplication in PGlite.
