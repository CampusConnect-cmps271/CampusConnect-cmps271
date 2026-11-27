# Accessibility checklist (SCRUM-312)

Audit of CampusConnect against WCAG 2.2 AA principles, on keyboard, small screens
and two browser engines. Written 2026-11-26.

## How to repeat it

```bash
cd frontend
npm run test:a11y            # both engines
npm run test:a11y -- --project=firefox
```

Set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome instead of Playwright's
Chromium. Firefox needs `npx playwright install firefox` once. The run uses the same
mocked Supabase servers as `npm run test:e2e`, so it needs no database.

Per-page findings, including lesser ones that do not fail the run, are written to
`frontend/test-results/a11y/<engine>-<group>.json`.

## What is covered

| Check | How | Where |
| --- | --- | --- |
| WCAG 2.0/2.1/2.2 A and AA rules (labels, names, contrast, landmarks, target size, ARIA) | axe-core, fails on critical or serious | `tests/a11y/accessibility.spec.ts` |
| Pages fit the viewport (no sideways scroll) | script check in the same scan | same |
| One `h1` per page | script check in the same scan | same |
| 360px phone, 768px tablet, 1280px desktop | each page scanned at all three | same |
| Chromium and Firefox | two Playwright projects | `playwright.a11y.config.ts` |
| Skip link is the first Tab stop and moves focus to `main` | keyboard test | `tests/a11y/keyboard.spec.ts` |
| Every Tab stop on the public pages shows a focus indicator | keyboard test (first 14 stops) | same |
| Report panel: focus moves in, Escape closes, focus returns, 44px target | keyboard test | same |

Pages scanned:

- **Signed out (5):** `/`, `/login`, `/register`, `/forgot-password`, `/clubs`
- **Signed in (16):** `/home`, `/courses`, `/courses/compare`, `/assistant`, `/saved`,
  `/profile`, `/messages`, `/notifications`, `/planner`, `/events`, `/skillswap`,
  `/posts/new`, `/communities`, `/search`, `/electives`, `/calendar`
- **With content (3):** a post that has a comment, a reply and is saved; `/saved`
  with that post in it; `/home` with it in the feed

## Result

No critical or serious violation in either engine at any of the three widths. The
scan found no moderate or minor violations either.

## Fixed in this story

| WCAG | Problem | Fix |
| --- | --- | --- |
| 2.4.1 Bypass blocks | No way to skip the navigation | `SkipLink` is the first Tab stop on every page |
| 2.5.3 Label in name | Course comparison links were named "Add CMPS 101 to comparison" while showing "Select for comparison", so voice control missed them | Name now starts with the visible text: "Select for comparison: CMPS 101" |
| 1.4.3 Contrast | Post page "Author:" line used `text-gray-400` and the author link `text-blue-400`, both under 4.5:1 on white | Uses `--ink-soft` and `--maroon` like the rest of the app |
| 2.1.1 / 2.4.3 Keyboard, focus order | Opening the report panel left focus on a button that disappeared; Escape did nothing | Focus moves to the reason field, Escape closes, focus returns to the button |
| 2.5.8 Target size | Report button was 40px tall | 44px |

Earlier SP5 stories already fixed the landing menu (SCRUM-287), the auth forms
(SCRUM-295), the assistant (SCRUM-302) and discussion controls (SCRUM-296).

## Known issues and gaps

None of these is a known critical or high blocker. They are listed so nobody reads
this checklist as more than it is.

| # | Severity | Item |
| --- | --- | --- |
| 1 | Moderate | Upvote and Save buttons change their label and also set `aria-pressed`, so a screen reader says "Upvoted, pressed". Existing e2e tests depend on those names. |
| 2 | Gap | No manual screen-reader pass (NVDA, VoiceOver). Coverage is axe plus keyboard only. |
| 3 | Gap | Two engines only: Chromium and Firefox. Safari/WebKit and real phones were not tested; the 360px phone is an emulated viewport. |
| 4 | Gap | Dark mode was not scanned. The app has a dark theme, so its contrast is unchecked. |
| 5 | Gap | Not scanned: `/admin/*`, `/moderation`, `/verify-email`, `/events/[id]`, `/planner/[id]`, `/messages/[id]`, `/profile/[id]`, `/courses/[code]`, `/communities/[slug]`, `/clubs/[slug]`, edit pages. The scan runs against mocked data, so these are mostly empty-state views. |
| 6 | Gap | The focus-indicator check samples the first 14 Tab stops on the four public auth/landing pages. Signed-in pages rely on axe and code review. |
| 7 | Low | The signed-in header has no mobile menu; its seven items wrap at 360px. It is usable but crowded. |
| 8 | Info | The Next.js dev overlay (`nextjs-portal`) takes focus in `next dev`. It does not exist in production and is excluded from the focus test. |
