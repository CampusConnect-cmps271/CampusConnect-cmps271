# CampusConnect uptime SLO and recovery runbook

This document defines the proposed SCRUM-315 reliability target and a repeatable, non-destructive validation procedure. It does **not** claim a full month of uptime from the Sprint 5 observation window.

## Proposed service level objective

- **Target:** 99.9% availability per calendar month for the core web/API journeys below.
- **Core journeys:** login page reachability, authenticated feed, events, courses and communities.
- **Measurement:** an authorized external runner performs read-only checks every 5 minutes from outside the deployment. Store timestamp, status, latency and journey name for every attempt.
- **Available:** HTTP 1xx–3xx expected by the journey and expected successful authenticated responses.
- **Reported separately:** HTTP 4xx, authentication failures and 429 rate limits. These are actionable product/client signals but are not automatically site outages.
- **Unavailable:** timeout/network failure, unexpected HTTP 5xx, or a failed required health probe.
- **Exclusions:** approved maintenance announced before the window, test-runner failure proven independent of CampusConnect, and optional AI degradation when non-AI core journeys remain usable. Exclusions require an audit note; they are never silently deleted.
- **Error budget:** 0.1% of the calendar month: 40.32 minutes in 28 days, 41.76 in 29 days, 43.20 in 30 days, or 44.64 in 31 days.

Request-based `/admin/availability` data complements the external probes but cannot prove continuous uptime when there is no traffic. `/admin/health` shows component reachability at a point in time. `/admin/performance` supplies p50/p95 latency context. Keep these signals distinct.

## Safe synthetic checks

Use only a staging deployment you are authorized to test. The committed runner sends GET requests only and never prints the authentication cookie.

```bash
cd frontend
SYNTHETIC_BASE_URL="https://staging.example.edu" \
SYNTHETIC_COOKIE="<short-lived synthetic account cookie>" \
SYNTHETIC_ATTEMPTS=3 \
SYNTHETIC_INTERVAL_MS=5000 \
npm run synthetic:staging > /tmp/campusconnect-synthetic.json
```

Without `SYNTHETIC_COOKIE`, the login reachability check runs and authenticated journeys are explicitly marked `skipped`. Do not reuse a personal session. Revoke the short-lived synthetic session after evidence collection.

## Alert policy

- Page on two consecutive failed probes for the same required service (a sustained 5xx/timeout condition).
- Escalate immediately if a degraded incident becomes an outage.
- Suppress duplicate notifications during the configured cooldown.
- Send a recovery event after an active incident returns to operational.
- The app evaluator and its tests validate transitions, but serverless process memory is not durable. The 5-minute external runner/monitor must persist incident state for production SLO evidence. The existing daily Vercel cron is a supplementary component check, not the SLO monitor.

## Repeatable staging recovery drill

Do not disconnect or stress production. Coordinate a staging window and capture expected versus actual results.

1. **Baseline:** run three synthetic attempts; record health, availability, errors and p95 latency.
2. **Database/API failure:** temporarily point the staging deployment at an approved unavailable fixture or use the staging provider's pause control. Expect database health `outage`, core data journeys to produce bounded fallback/error responses, and two consecutive failures to open an incident.
3. **Timeout:** use an approved staging-only fixture that delays beyond the 8-second check timeout. Expect `timeout_or_network`, not a 4xx classification.
4. **Optional AI failure:** use a disabled/invalid staging-only provider configuration. Expect the AI check to degrade while login, feed, events and courses remain independently measurable.
5. **Recovery:** restore the original staging configuration, redeploy if required and run three more attempts. Expect health to return to operational and one recovery notification to clear the active incident.
6. **Correlate:** record the same timestamps from `/admin/errors`, `/admin/performance`, `/admin/availability` and the SCRUM-309 load report. SCRUM-309 belongs to the load-testing owner; link their result rather than rerunning unauthorized stress tests.

## Operator response

1. Confirm whether the signal is a 5xx/timeout, health failure, 4xx/auth issue or 429 capacity/rate-limit event.
2. Check deployment status, Supabase status/advisors, recent releases and redacted error groups.
3. Identify the smallest safe mitigation: roll back the latest deployment, disable the optional provider, or restore the known-good staging/production configuration through the approved platform control.
4. Never paste secrets into logs or Jira. Rotate any credential suspected of exposure.
5. Verify recovery with at least three passing external checks and the relevant component health check.
6. Record detection time, acknowledgement time, mitigation, recovery time, impact, evidence links and follow-up owner.

## Evidence template

| Field | Value |
| --- | --- |
| Commit / deployment | |
| Environment | staging |
| Drill start / end (UTC) | |
| Failure injected | |
| Expected result | |
| Actual result | |
| Detection time | |
| Recovery time | |
| Synthetic evidence path | |
| Dashboard / log evidence | |
| SCRUM-309 load evidence | Pending teammate task |
| Unresolved critical defects | None / list blocker |

## Verification record

Local verification on 2026-11-25:

- `npm run test:reliability`: 19 checks passed, including 4xx/429 separation, timeout/5xx classification, sustained-failure alerting and recovery clearing.
- `npm run build -- --webpack`: passed.
- Monitoring browser access-control journeys and the visual dashboard evidence test passed.
- No full-month uptime claim is made. A real staging drill still needs an authorized staging URL and short-lived synthetic account, and SCRUM-309 load results remain owned by its assigned teammate.
