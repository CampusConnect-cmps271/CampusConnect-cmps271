# SCRUM-142: Post search backend

Date: October 19, 2026. Branch: `scrum-142`, based on pushed SCRUM-174 commit
`8120530`. Assigned Jira task: SP2-19, Post search.

## What was done

Added and deployed migration `20261019162328_add_post_full_text_search.sql`.
It creates a published-only GIN expression index over post titles and bodies
and the RPC `public.search_published_posts(p_query, p_page, p_page_size)`.
Titles receive more weight than bodies. Results sort by relevance, then
creation time and ID for stable pagination. Existing table columns, write
permissions and RLS policies are unchanged.

Both document and query tokens use Postgres `simple` configuration. English
matching is case-insensitive; Arabic tokens are searchable with matching
spelling. All keywords must match across title/body. Empty and punctuation-only
queries return no posts. This is literal token search, with no stemming,
transliteration, substring matching or wildcard/operator syntax.

The function uses invoker security and the caller's RLS. It explicitly excludes
deleted posts even when the author can read their deleted posts directly.
Anonymous execution is denied; authenticated users and trusted maintenance
can execute. Query length is capped at 200 characters, page size at 50 plus one
lookahead row, and page number at 10,000. Inputs are SQL parameters.

Added `getPostSearchResults()` for SCRUM-143 to consume. It authenticates before
handling input, normalizes whitespace and Unicode length, uses 20 results per
page, validates RPC responses, and returns `posts`, `hasMore` and `nextPage`.
Failures raise a safe error and log only an error code. No new package was used.

## Files added

- `supabase/migrations/20261019162328_add_post_full_text_search.sql`:
  deployed index, ranked search function and explicit permissions.
- `frontend/modules/posts/search-input.ts`: shared input and page bounds.
- `frontend/modules/posts/search.ts`: authenticated, validated server query.
- `frontend/modules/posts/search.test.ts`: 23 input/query unit cases.
- `frontend/tests/post-search.test.mjs`: 17 database cases for English/Arabic,
  ranking, pagination, RLS, permissions, edits/deletion and index eligibility.
- `supabase/queries/verify-post-search.sql`: read-only SQL Editor checks.
- `SCRUM_142_REPORT.md`: this report.

## Verification

- All **425 unit tests**, all **15 database/import test files**, type checking,
  ESLint and whitespace checks passed. Direct execution separately confirmed
  all **17 new database cases** passed.
- A selective 4,004-row synthetic fixture produced a plan using the GIN index.
  Test fixtures are local and never inserted into hosted Supabase.
- Hosted SQL found a matching published post, zero leaked deleted posts, zero
  blank-query matches, valid/ready index metadata and correct function grants.
  Arabic token matching also passed on the hosted database. Role-specific RLS
  behavior was tested locally; hosted functional SQL ran as the SQL Editor role.
- A real anonymous REST request was denied with HTTP **401**, code **42501**.
  Hosted data remains **11 posts: 8 published and 3 deleted**, with no row edits.
- No new security advisor findings. The new index has an INFO notice for no
  recorded use yet; see [unused-index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
  Existing unrelated advisor notices remain outside this task.

References: [Supabase full-text search](https://supabase.com/docs/guides/database/full-text-search),
[Postgres parsing/ranking](https://www.postgresql.org/docs/17/textsearch-controls.html)
and [simple dictionary](https://www.postgresql.org/docs/17/textsearch-dictionaries.html#TEXTSEARCH-SIMPLE-DICTIONARY).

## Delivery and next task

Changes remain uncommitted/unpushed for manual delivery. Use `scrum-174` as the
PR base while PR #25 is open. SCRUM-174 and its parent SCRUM-68 are **Done** in
Jira. SCRUM-142 and parent SCRUM-63 are **In Progress**, pending review.

**SCRUM-143** is next: add the feed search box and results page, including an
empty state that offers to create a post. No search UI was added in SCRUM-142.
The SCRUM-166 held catalogue entries remain set aside.
