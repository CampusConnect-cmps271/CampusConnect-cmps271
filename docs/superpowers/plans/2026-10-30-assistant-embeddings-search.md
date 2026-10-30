# Assistant Embeddings Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The campus assistant finds stored pages and catalogue courses by meaning as well as by keyword, so students no longer need exact wording, and it can suggest real courses from a stated interest.

**Architecture:** Add Gemini embeddings (768 numbers per text) stored in Supabase with `pgvector`. At question time embed the question, run the existing keyword RPCs and two new semantic RPCs, and merge the two ranked lists with reciprocal rank fusion. If embedding fails, search is keyword-only exactly as today. Stored text is embedded by a backfill script.

**Tech Stack:** Next.js 16 (`frontend/`), Supabase Postgres + `pgvector` 0.8.2 (available in the local stack), Gemini `gemini-embedding-001`, vitest (`modules/**/*.test.ts`), `node --test` (`tests/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-30-assistant-embeddings-design.md` (steps 1 to 3 only). Step 4, the graduation check, gets its own plan after Task 1 shows what the catalogue's requirement sections look like.

## Global Constraints

- Answers use only stored text, cite their sources, and say they cannot answer rather than guess. Nothing here may weaken `answerQuestion`'s citation rebuilding.
- Suggested courses must be real catalogue courses, shown with code and a citation.
- Keyword search stays; embeddings add to it. "CMPS 271" style queries must still rank the named course first.
- `GEMINI_API_KEY` stays server-side. Embedding the question has its own 5 s timeout; on any embedding failure fall back to keyword-only search. The answer-provider timeout/retry change is NOT part of this plan.
- Question limit 500 characters and rate limit 10 per minute per user are unchanged.
- Work against local Supabase only (`npx supabase start`, test account `test.student@mail.aub.edu`). Do not run `supabase db push` against hosted and never run `supabase migration repair`.
- Catalogue year is 2026-27 only. Generated catalogue data is committed under `supabase/data/aub-catalogue/2026-27/`; downloaded PDFs are not.
- `frontend/AGENTS.md`: this Next.js has breaking changes; read the relevant guide in `frontend/node_modules/next/dist/docs/` before touching Next code (Task 6).
- Scripts are plain `.mjs` and refuse hosted targets unless `--hosted` is passed, like `scripts/ingest-campus-sources.mjs` (reuse `resolveImportTarget` from `scripts/import-courses.mjs`).

## Review Focus

1. A question made only of filler words ("what is the"): keyword terms are empty. Expected: no evidence, the no-evidence answer, the provider is never called. (Task 5)
2. Embedding service down, slow, or key missing: the student still gets a normal keyword answer, no 503, a warning is logged. (Tasks 3 and 5)
3. An unrelated question ("best pizza in Beirut"): the similarity floor returns no semantic rows, so the answer is the no-evidence one. (Tasks 2 and 8)
4. A query that names a course code: that course stays first after merging. (Task 5)
5. Stored text edited after it was embedded: the old vector must stop matching until re-embedded. (Task 2)

---

### Task 1: Catalogue data for 2026-27

**Files:**
- Create (generated, committed): `supabase/data/aub-catalogue/2026-27/{courses.csv,provenance.json,report.json,review.json,sources.json}`

**Interfaces:**
- Produces: a populated local `public.courses` table (hundreds of rows), and the catalogue text that the graduation-check plan will read.

- [ ] **Step 1:** From `frontend/`, create branch `ameera/assistant-embeddings` from the current HEAD (it contains the assistant). Start local Supabase if it is not running.
- [ ] **Step 2:** Run `npm run extract:courses -- --year 2026-27` (network, slow, writes only files). Read `report.json` and `review.json`. Expected: no faculty failures; if some fail, record which and continue with the rest.
- [ ] **Step 3:** Run `npm run import:courses -- ../supabase/data/aub-catalogue/2026-27/courses.csv --dry-run`. Expected: validation passes with a row count. Fix nothing by hand in the CSV; if validation fails, report the failing records.
- [ ] **Step 4:** Run the same command without `--dry-run`. Verify: `docker exec supabase_db_campusconnect psql -U postgres -tAc "select count(*) from public.courses"` prints the same count.
- [ ] **Step 5:** Check `.gitignore` covers the extractor's PDF cache, then commit the five generated files.

### Task 2: Vector storage and semantic search functions

**Files:**
- Create: `supabase/migrations/20261030100000_campus_assistant_embeddings.sql`
- Test: `frontend/tests/campus-assistant-semantic.test.mjs`

**Interfaces:**
- Produces: column `embedding extensions.vector(768)` (nullable) on `public.campus_source_chunks` and `public.courses`; `public.search_campus_chunks_semantic(p_embedding extensions.vector(768), p_limit integer default 5, p_min_similarity real default 0.5)` returning the same columns as `search_campus_chunks`, with `relevance` = cosine similarity; `public.search_campus_courses_semantic(...)` likewise returning the same columns as `search_campus_courses`. Both run as the caller (`security invoker`), `set search_path = ''`, granted to `authenticated` and `service_role` only.

PGlite 0.5.8 here has no `vector` extension, so this test runs against the local Supabase stack and skips itself when `http://127.0.0.1:54321` is unreachable.

- [ ] **Step 1: Write the failing test** `tests/campus-assistant-semantic.test.mjs` using `createClient` from `@supabase/supabase-js` with the local URL and `SUPABASE_SECRET_KEY` from `.env.local`. Insert three chunk rows and three course rows (fixed ids prefixed `test-`) with hand-made 768-number vectors (a one-hot-ish vector helper), then assert:
  - `ranks the nearest vector first`: querying with chunk A's vector returns A before B.
  - `drops rows below the similarity floor`: an orthogonal vector returns no rows with `p_min_similarity = 0.5`.
  - `ignores rows with no embedding`.
  - `clears the embedding when the text changes`: update a chunk's `text`, then `embedding` is null; update only an unrelated column and it is kept (same for a course's `description`).
  - `limits results` to `p_limit`.
  Clean up the test rows in `after`.
- [ ] **Step 2:** Run `node --test tests/campus-assistant-semantic.test.mjs`. Expected: FAIL (columns and functions missing).
- [ ] **Step 3:** Write the migration: `create extension if not exists vector with schema extensions`; add the two columns; HNSW cosine indexes (`extensions.vector_cosine_ops`); a `before update` trigger on each table that sets `embedding = null` when `text` (chunks) or `name`/`description`/`department` (courses) change; the two functions. Because `search_path = ''`, qualify the operator as `operator(extensions.<=>)`. Similarity is `1 - distance`. Follow the structure, comments, `revoke`/`grant` and `notify pgrst, 'reload schema'` of `20261024100000_create_campus_assistant_sources.sql`.
- [ ] **Step 4:** Apply with `npx supabase migration up --local` (from the repo root), rerun the test. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 3: Embedding client for the app

**Files:**
- Create: `frontend/modules/campus-assistant/embeddings.ts`
- Test: `frontend/modules/campus-assistant/embeddings.test.ts`
- Modify: `frontend/modules/campus-assistant/index.ts`

**Interfaces:**
- Produces: `EMBEDDING_DIMENSIONS = 768`; `QUERY_EMBED_TIMEOUT_MS = 5_000`; `class EmbeddingError extends Error { readonly kind: "not_configured" | "timeout" | "unavailable" | "invalid_response" }`; `type QueryEmbedder = (text: string) => Promise<number[]>`; `createGeminiQueryEmbedder(config: { apiKey: string; model: string }, fetchImpl?: typeof fetch): QueryEmbedder`; `getConfiguredQueryEmbedder(env?: Record<string, string | undefined>): QueryEmbedder` (reads `GEMINI_API_KEY`, optional `CAMPUS_ASSISTANT_EMBEDDING_MODEL`, default `gemini-embedding-001`; throws `EmbeddingError("not_configured")` when the key is blank); `normalize(vector: number[]): number[]` (unit length); `embedQuerySafely(embedder: QueryEmbedder, text: string): Promise<number[] | null>` (returns null on any failure).
- Mirrors `provider.ts` (key in `x-goog-api-key` header, `AbortSignal.timeout`, error kinds). Calls `:embedContent` with `taskType: "RETRIEVAL_QUERY"` and `outputDimensionality: 768`. The scripts have their own client in Task 4 because scripts are plain `.mjs`.

- [ ] **Step 1: Write the failing tests** (`fetchImpl` faked, as in `provider.test.ts`): `sends the key as a header and requests 768 dimensions with the query task type`; `returns a unit-length vector` (e.g. `normalize([3, 4])` equals `[0.6, 0.8]`); `maps timeout, outage and non-OK status to distinct kinds`; `rejects a response with the wrong vector length as invalid_response`; `reports a blank key as not_configured`; `embedQuerySafely returns null for every failure kind and for an unexpected throw, and the vector on success`.
- [ ] **Step 2:** Run `npx vitest run modules/campus-assistant/embeddings.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the interface above; export the public names from `index.ts`.
- [ ] **Step 4:** Rerun. Expected: PASS. Commit.

### Task 4: Backfill script

**Files:**
- Create: `frontend/scripts/lib/gemini-embed.mjs`, `frontend/scripts/embed-campus-content.mjs`
- Test: `frontend/tests/campus-embed.test.mjs`
- Modify: `frontend/package.json` (add `"embed:campus-content": "node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/embed-campus-content.mjs"`)

**Interfaces:**
- Produces: `embedTexts(texts: string[], options: { apiKey: string; taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"; model?: string; fetchImpl?: typeof fetch }): Promise<number[][]>` in `gemini-embed.mjs` (uses `:batchEmbedContents`, at most 100 texts per request, 768 dimensions, normalised output, same default model as Task 3); in `embed-campus-content.mjs`: `chunkEmbeddingText(chunk: { text: string }): string`, `courseEmbeddingText(course: { code, name, department, description }): string` (code, name, department, then description, cut to 2000 characters), `pendingRows(client, table: "campus_source_chunks" | "courses", all: boolean)`, and the CLI `npm run embed:campus-content [-- --dry-run] [--all] [--hosted]`. Without `--all` it embeds only rows whose `embedding` is null.

- [ ] **Step 1: Write the failing tests:** `courseEmbeddingText starts with the code and name and is cut to 2000 characters`; `embedTexts splits 250 texts into 3 requests and returns vectors in input order`; `embedTexts normalises each vector`; `a --dry-run run reads pending rows but writes nothing` (fake client records calls); `refuses a non-loopback Supabase URL without --hosted`.
- [ ] **Step 2:** Run `node --test tests/campus-embed.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement. Write vectors with `update ... set embedding = '[...]'` per row through supabase-js using the secret key; print "N chunks and M courses embedded" at the end. Page chunks and courses are separate passes.
- [ ] **Step 4:** Rerun tests. Then run for real: `npm run embed:campus-content`. Verify: `select count(*) from public.campus_source_chunks where embedding is null` and the same for `courses` both print 0.
- [ ] **Step 5:** Commit.

### Task 5: Hybrid retrieval

**Files:**
- Modify: `frontend/modules/campus-assistant/retrieval.ts`, `schema.ts`
- Test: `frontend/modules/campus-assistant/retrieval.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2 RPC names; Task 3's vectors as `number[]`.
- Produces: `reciprocalRankFusion<T>(lists: T[][], key: (item: T) => string, limit: number): T[]` (score `1 / (60 + rank)` summed over lists, ties broken by first appearance); `RpcClient.rpc` accepts the two new function names with args `{ p_embedding: string; p_limit: number }` (the vector as `"[0.1,0.2,…]"`); `retrieveEvidence(client: RpcClient, question: string, embedding?: number[] | null): Promise<EvidenceChunk[]>`; `MAX_COURSE_EVIDENCE` raised from 3 to 6 (interest suggestions need more candidates).

- [ ] **Step 1: Write the failing tests:** `fusion puts an item found by both lists above items found by one`; `fusion keeps the first list's order for single-list items and respects the limit`; `without an embedding only the two keyword RPCs are called` (existing test stays green); `with an embedding all four RPCs are called and keyword and semantic pages are merged`; `a course named by code stays first after merging` (keyword list `[CMPS 271]`, semantic list `[other, CMPS 271]` → first is `CMPS 271`); `a semantic RPC error is ignored and keyword results are returned`; `a keyword RPC error still throws "Source search failed"`; `a question of only filler words returns [] and calls no RPC` (even when an embedding is supplied).
- [ ] **Step 2:** Run `npx vitest run modules/campus-assistant/retrieval.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement. Keep `searchTerms` and the empty-terms early return exactly as they are. Run the four RPCs in one `Promise.all`; fuse pages by `chunk_id`, courses by `code`; page limit `MAX_PAGE_EVIDENCE`, course limit `MAX_COURSE_EVIDENCE`; fetch each list with limit 10 and 5 respectively, then fuse.
- [ ] **Step 4:** Rerun the whole module: `npx vitest run modules/campus-assistant`. Expected: PASS. Commit.

### Task 6: Wire embeddings into the route

**Files:**
- Modify: `frontend/app/api/campus-assistant/route.ts`

**Interfaces:**
- Consumes: `getConfiguredQueryEmbedder`, `embedQuerySafely` (Task 3); `retrieveEvidence(client, text, embedding)` (Task 5).

`answerQuestion` may search `question + previous question` for vague follow-ups, so the embedding is made per searched text inside the `retrieve` callback, not once up front.

- [ ] **Step 1:** Read the relevant guide in `frontend/node_modules/next/dist/docs/` for Route Handlers.
- [ ] **Step 2:** Change the `retrieve` argument to `async (text) => retrieveEvidence(supabase, text, embedder ? await embedQuerySafely(embedder, text) : null)`. Build `embedder` with `getConfiguredQueryEmbedder()` inside a try; on failure use null and `log.warn("campus_assistant.embedding_unavailable", { kind }, { userId })`. Also warn when `embedQuerySafely` returns null. Never log question text.
- [ ] **Step 3:** Run `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 4 (manual check):** with the dev server running against local Supabase, sign in and ask "when does the library shut" and "how do I get an official transcript". Expected: both answered with citations. Then set `CAMPUS_ASSISTANT_EMBEDDING_MODEL=nonexistent` and restart; the same questions must still answer from keyword search and the dev log must show the warning. Restore the variable.
- [ ] **Step 5:** Commit.

### Task 7: Course suggestions from interests

**Files:**
- Modify: `frontend/modules/campus-assistant/provider.ts` (`SYSTEM_PROMPT` only)
- Test: `frontend/modules/campus-assistant/provider.test.ts`

**Interfaces:**
- Consumes: Task 5's larger course evidence list.
- Produces: no new code interfaces.

- [ ] **Step 1: Write the failing test** `the system prompt tells the model to suggest only courses from the excerpts, with their codes`: assert `SYSTEM_PROMPT` contains `"suggest"` and `"only courses"` and still contains `"Use only facts stated in the excerpts"`.
- [ ] **Step 2:** Run `npx vitest run modules/campus-assistant/provider.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Add one bullet to `SYSTEM_PROMPT`: when the student describes an interest, suggest up to five courses taken only from the course excerpts, give each code and a one-line reason, cite them, and never name a course that is not in an excerpt. If no excerpt fits, set `insufficient_evidence` to true.
- [ ] **Step 4:** Rerun. Expected: PASS. Commit.
- [ ] **Step 5 (manual check):** ask "I like how people think and I also like programming". Expected: real courses with codes, each linking to `/courses/<code>`.

### Task 8: Evaluation set, threshold tuning and docs

**Files:**
- Create: `frontend/modules/campus-assistant/eval/questions.json`, `frontend/scripts/eval-assistant-retrieval.mjs`, `supabase/CAMPUS_ASSISTANT.md`
- Test: `frontend/tests/campus-eval.test.mjs`
- Modify: `frontend/package.json` (add `"eval:assistant": "node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/eval-assistant-retrieval.mjs"`)

**Interfaces:**
- Produces: `questions.json` as an array of `{ id: string, kind: "page" | "course" | "interest", question: string, expect: string[] }` where `expect` lists `chunk_id` or `course:CODE` values that should appear in the top results; about 25 entries per kind written from the data actually loaded in Tasks 1 and 4, including some Arabic and some rephrased wordings ("shut", "sign up", "classes about…") and at least three unrelated questions with `expect: []`; `recallAtK(results: string[], expect: string[], k: number): number`; CLI `npm run eval:assistant [-- --mode keyword|hybrid] [--min-similarity 0.5]` printing recall@8 per kind. Library hours are added to the set when the owner supplies the text.

- [ ] **Step 1: Write the failing tests:** `recallAtK is 1 when every expected id is in the first k and 0.5 when half are`; `an entry with an empty expect list passes only when nothing is returned`; `every entry in questions.json has a unique id, a known kind and a non-empty question`.
- [ ] **Step 2:** Run `node --test tests/campus-eval.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement the script (calls the same RPCs as the app, uses `gemini-embed.mjs` for hybrid mode, local Supabase only) and write `questions.json`.
- [ ] **Step 4:** Run `npm run eval:assistant -- --mode keyword`, then `-- --mode hybrid`. Record both tables in `supabase/CAMPUS_ASSISTANT.md`. Expected: hybrid recall is higher for rephrased and interest questions and the unrelated questions return nothing. If unrelated questions return rows, raise the floor (try 0.55, 0.6) until they do not while page and course recall is kept; then change the default of `p_min_similarity` in a new migration `20261030110000_campus_assistant_similarity_floor.sql` (`create or replace` both functions) and rerun Task 2's test.
- [ ] **Step 5:** In `CAMPUS_ASSISTANT.md` document, in order: `ingest:campus-sources`, `extract:courses`, `import:courses`, `embed:campus-content`, `eval:assistant`, and the rule that hosted pushes wait for the team to resolve the four missing migrations.
- [ ] **Step 6:** Run the full suite: `npx vitest run` and `node --test tests/*.test.mjs`. Expected: PASS (the semantic test skips itself only when local Supabase is down). Commit.
