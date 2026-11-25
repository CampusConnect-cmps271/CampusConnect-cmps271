# Sprint 5 security, permissions and privacy regression

This is the reproducible release matrix for SCRUM-313. It uses synthetic accounts and local PGlite or mocked services. It does not probe production or mutate shared data.

## Run it

```bash
cd frontend
npm run test:security
npm audit --omit=dev
```

GitHub Actions also runs dependency audit and CodeQL through `.github/workflows/security-scans.yml`. A green reporting workflow is not proof that advisories were fixed; review the uploaded audit artifact and the repository Security tab.

## Regression matrix

| Risk | Reproducible evidence | Expected protection |
| --- | --- | --- |
| Cross-user posts, reports and audit rows | `tests/moderation.test.mjs` | Students cannot read moderation data or audit rows; reports are private; only staff decide reports. |
| Private messages and read state | `tests/messaging.test.mjs` | Only conversation participants read messages; each participant changes only their own read state. |
| Study plans, courses and meetings | `tests/planner.test.mjs` | A student cannot read, move, edit or delete another student's plan data. |
| Saved events and reminder ownership | `tests/event-reminders.test.mjs` | A student cannot save for another account or read another student's reminder schedule. |
| Club membership and verification | `tests/clubs.test.mjs` | Memberships are private; representatives cannot approve their own verification request; decisions are audited. |
| Event ownership | `tests/event-management.test.mjs` | Organizers and administrators cannot change ownership or edit/cancel another organizer's event. |
| Roles, admin functions and pages | `tests/roles-permissions.test.mjs`, browser tests | Students cannot list/assign roles; anonymous callers cannot execute administrator functions; protected pages redirect non-admins. |
| Suspensions and moderation permissions | `tests/moderation.test.mjs` | Suspended sessions cannot create posts, comments, votes or reports; privileged actions require role checks. |
| Log privacy and secrets | `modules/logging/redact.test.ts`, `tests/monitoring-security.test.mjs` | Sensitive keys and tokens are redacted; only administrators read app logs; clients cannot insert fake logs. |
| Input abuse, XSS-like content and injection | schema/restriction tests plus parameterized database calls | Length/type checks reject malformed input; community restrictions reject unsafe content; database queries remain parameterized. |
| Authentication rate limits | `modules/auth/actions.test.ts` | Rate-limited login/reset responses remain generic and do not disclose account existence. |
| Dependency and source scanning | npm audit and CodeQL workflow | Critical/high findings must be fixed or explicitly block release; scan completion alone is not acceptance. |

## Release decision

- Any reproducible critical/high authorization bypass, exposed secret, cross-user private-data read or production-destructive test blocks release.
- Medium/low findings require a Jira issue, owner and risk decision before release.
- Test evidence must include the command, commit SHA, date, environment and pass/fail output.
- Never paste session cookies, Supabase secret/service-role keys, webhook tokens or raw private messages into evidence.

## Verification record

Local verification on 2026-11-25 for `mohamad/sprint-5-polish-security-reliability`:

- `npm run test:security`: 178 checks passed.
- `npm run test:reliability`: 19 checks passed.
- `npm run test:db`: 625 passed, 4 pre-existing TODO tests, 0 failed.
- `npm run test:unit`: 1,294 tests passed; two local-stack integration suites could not collect because a local Supabase URL/key was not configured.
- `npm run lint`: passed.
- `npm run build -- --webpack`: passed.
- Focused club, community, monitoring and Sprint 5 visual-evidence browser journeys: 14 passed. Screenshot attachments are included in the Playwright report artifact when CI runs.
- `npm audit` after upgrading Next.js, Zod, Vite/Vitest and the affected linting toolchain: 0 vulnerabilities.
