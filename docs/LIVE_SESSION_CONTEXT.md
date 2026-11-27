# Live session context

Signed-in page rendering used to call Auth `/auth/v1/user`, then read the profile
name from PostgREST. `getCurrentUser()` now verifies the access token with the
Supabase SDK's `getClaims()` and reads live account, session and display-name
state through one authenticated `get_my_session_context()` RPC. React `cache()`
only deduplicates this work within the current render/request. Personal data is
never placed in the course catalogue cache or any cross-request cache.

With asymmetric signing keys the SDK verifies the signature and expiration
using cached public JWKS keys. Initial key discovery and token refresh can still
make Auth requests. For symmetric keys the SDK itself falls back to network Auth
verification. We do not decode an unverified JWT for authorization.

## Security boundary

The server checks verified subject, session ID, role, audience, issuer and expiry.
The RPC checks the token subject against the live Auth user and the token session
ID against a session owned by that same user. A missing/revoked session, expired
`not_after`, deleted/banned user or anonymous account returns null. Confirmation
comes from the current `auth.users.email_confirmed_at`, never user-editable
metadata. Metadata is used only for display-name fallback.

The public RPC is `SECURITY INVOKER`, takes no arguments, and reads the optional
own profile under the caller's existing RLS. A small `SECURITY DEFINER` helper is
necessary to read Auth tables, which are otherwise inaccessible to authenticated
users. It lives in the unexposed `app_private` schema, has an empty search path,
accepts no caller-supplied IDs and returns no tokens or secrets. Only authenticated
users have execute rights. Keep `app_private` out of the Data API exposed schemas.

A profile lookup failure can fall back to the registration name. Identity errors,
null context, malformed responses and mismatched IDs fail closed. They do not
retry using `getUser()`, which could bypass a live rejection. Auth-service session
inactivity and single-session policies continue to be enforced at token refresh;
this change preserves the existing proxy refresh flow. It also checks explicit
session expiry on each context read.

Role administration and the existing role-gated Auth helpers keep their existing
`getUser()` checks. This optimization targets common signed-in pages, not every
Auth endpoint or every client-side profile query.

## Rollout and rollback

Apply `20261127145452_live_session_context.sql` before deploying this code. The
path is enabled by default. Set `AUTH_LIVE_CONTEXT_ENABLED=false` and redeploy to
restore the previous Auth-user/profile path. Keep the additive migration in place
for rollback; it does not alter existing tables, policies or user data.

Validation includes unit and PGlite authorization tests plus a dedicated browser
suite using actual ES256-signed fixture tokens and the unmodified Supabase SDK.
Run `npx playwright test --config playwright.auth-context.config.ts` for that suite.
Other browser suites explicitly exercise the legacy path and its rollback.

After deployment, rerun the same guarded 50-user warm workload before progressing
to 100 and 200. Compare errors, p95, p99 and gateway upstream timings. Reducing
Auth/profile network calls does not establish a concurrency limit or prove that
memory, pool waits or infrastructure stalls are resolved.
