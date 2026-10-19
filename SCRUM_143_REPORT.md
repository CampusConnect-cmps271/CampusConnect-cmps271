# SCRUM-143: Post search UI

Date: October 19, 2026. Branch: `scrum-143`, based on pushed SCRUM-142
commit `dcbef8f`. Assigned Jira task: SP2-20, Search page.

## What was done

Added a keyword search box to the campus feed and a protected `/search` App
Router page. Results use SCRUM-142's existing ranked Supabase query and show
post title, category, date and a plain-text preview, linking to the full post.
Keywords remain in the URL through refresh, pagination and browser navigation.
New searches reset the page; blank searches prompt for keywords. English and
Arabic text use automatic text direction.

The search form preserves typing during normal first-load hydration and only
resets restored history values. A delayed-script browser check also verifies
that prefilled new-post fields wait for their handlers before accepting edits.

When the first page has no matches, “Ask this question” opens the existing
new-post form with a safely bounded title. The student still supplies content
and category and chooses whether to publish. Normal new-post visits stay blank.
An empty later page offers the first page of the same search. Database failures
and malformed results have a retry state, retaining the query and page.

Search queries use the authenticated server helper and existing RLS. Post text
renders as text, without injected HTML. No new database migration, package,
hosted post, review or account was needed.

## Files added or changed

- `frontend/app/(protected)/search/page.tsx` and `loading.tsx`: protected
  search route and loading state.
- `frontend/modules/posts/PostSearchForm.tsx`, `PostSearchResults.tsx` and
  `post-search.module.css`: feed/search form, results, pagination, empty/retry
  states and responsive light/dark styling.
- `frontend/modules/posts/search-navigation.ts` and
  `search-navigation.test.ts`: URL parsing, safe links and bounded question
  titles, including Unicode and the existing title validator's length limit.
- `frontend/app/(protected)/home/page.tsx`: feed search integration.
- `frontend/app/(protected)/posts/new/page.tsx` and `post-form.tsx`: optional
  title prefill from the search empty state.
- `frontend/tests/e2e/mock-post-search.mjs`, `mock-supabase.mjs` and
  `post-search.spec.ts`: isolated synthetic search fixtures and eleven browser
  cases, including relevance order, Arabic, pagination, history, safe text,
  failed responses, question handoff, authentication and mobile layouts.
- `SCRUM_143_REPORT.md`: this report.

## Verification and delivery

All **439 unit tests**, including 14 new navigation cases, type checking and
ESLint passed. All **84 existing browser cases** passed in the full run. After
fixing a first-load reset, all **11 new search cases** and **10 existing post
journey cases** passed in the final targeted run. Mobile screenshots were
inspected in light and dark modes. Browser fixtures do not write to hosted
Supabase. The production build (`npm run build -- --webpack`) and whitespace
checks also passed.

SCRUM-142 is **Done** in Jira and PR #26 remains open. SCRUM-143 and parent
SCRUM-63 are **In Progress**, pending user review and manual delivery. Changes
remain uncommitted/unpushed; use `scrum-142` as the PR base while #26 is open.

Reviewed the new moderation changes on `main` (`273f0d8`); they do not change
the feed or search backend used by this task. This branch continues the PR
stack from SCRUM-142. The SCRUM-166 catalogue holds remain set aside.

The earlier SCRUM-172 CI rerun failed on the review hydration bug already fixed
in SCRUM-173: replacement text was appended to the prior review. The current
branch's review tests passed. A three-file backport is prepared at
`/tmp/scrum172-review-hydration.patch`, and `git apply --check` against the old
SCRUM-172 files passed. It has not been committed or pushed to that older
branch; PR #23 still needs that update. This patch does not include search UI.
