# Campus assistant: meaning-based search, course suggestions and a graduation check

Date: 2026-10-30. Status: draft for approval. Owner: Ameera.

## Why

The campus assistant (`/assistant`, SP3-41) answers student questions from stored official AUB pages and the course catalogue. It finds evidence by keyword matching: the question's words are OR-ed into a Postgres full-text query (`search_campus_chunks`, `search_campus_courses`). So a question only works when it is worded close to the stored text. "What time does the library shut?" misses a page that says "close", and a student describing an interest finds nothing.

The owner's description of the pain: "I just have to ask the question perfectly worded or it won't understand."

Two problems look alike and must stay separate:

- **Wording problem:** the answer is stored, but the student phrased it differently. Embeddings fix this.
- **Missing data:** the answer is not stored at all. Embeddings cannot fix this. Example: library hours. The AUB library page loads its hours with JavaScript, so the scraped text holds only the heading "Today's Hours". Nothing in the database mentions Jafet or Monday.

## What gets built, in this order

1. **Course catalogue import.** Run the existing extractor (`npm run extract:courses`, then `npm run import:courses`) for the 2026-27 undergraduate and graduate catalogues. The local `courses` table is empty today and the extractor has never been run. Import all faculties, not only the two majors below, so interest-based suggestions can draw on the whole catalogue (builder's call, see below).
2. **Embeddings search.** Match questions to stored text by meaning. Combine it with the current keyword search; do not replace keyword search, because course codes such as "CMPS 271" match best by keyword. Applies to campus page chunks and to courses. Library hours become findable by meaning once the owner adds them as text.
3. **Interest-based course suggestions.** A student describes what they like ("I like how people think and I like programming") and gets matching real courses with citations.
4. **Graduation check, Computer Science and Psychology only.** The student types the courses they have taken. The assistant compares that with the stored degree requirements for the major and says what remains and whether they look on track.

Steps 1 to 3 are close to the existing design. Step 4 is new work and the riskiest, so it comes last.

## Goals

- A student can phrase a question naturally and still reach the stored answer.
- Answers keep today's rules: use only stored text, cite the sources, say "I can't answer that" rather than guess.
- Suggested courses are always real catalogue courses, shown with their code and a citation.
- The graduation check gives the student a clear list: requirements met, requirements remaining, anything it could not judge.

## Non-goals

- Not an official degree audit. Every graduation answer says it relies on what the student typed and names the catalogue year it used.
- Only Computer Science and Psychology in this version. Other majors are out.
- No storing of student transcripts, course histories or accounts for this feature. The student types their courses each time.
- Supplying the library hours. The owner will add them later as text.
- Replacing the answer model or the page ingestion pipeline.

## Anti-goals (a failure even if it technically works)

- A confident wrong statement about degree requirements.
- Suggesting a course that does not exist or is not in the stored catalogue.
- Answering from outside knowledge when the stored text does not contain the answer.
- Any change that breaks the existing assistant's refusal to guess.

## Constraints and facts about the current system

- Stack: Next.js 16 and Supabase in `frontend/`. `frontend/AGENTS.md` says this Next version has breaking changes and to read `node_modules/next/dist/docs/` before writing code.
- The assistant route is `frontend/app/api/campus-assistant/route.ts`. Retrieval is in `frontend/modules/campus-assistant/retrieval.ts`; the model call is in `provider.ts` (Gemini, `GEMINI_API_KEY` in `frontend/.env`, default model `gemini-3.1-flash-lite`, 15 s timeout, no retry). The provider key stays on the server.
- Rate limit is 10 questions a minute per user. A question is at most 500 characters.
- Search functions: `public.search_campus_chunks` and `public.search_campus_courses`, from migrations `20261024100000` and `20261024110000`. They run as the caller, under row-level security.
- Stored page sources are listed in `supabase/data/campus-sources.json` and loaded with `npm run ingest:campus-sources`. Eleven sources are loaded locally today.
- Course catalogue: `npm run extract:courses` downloads AUB's faculty PDFs from `aub.edu.lb/Registrar/catalogue<year>/ug|gr/` and writes a CSV; `npm run import:courses -- <csv>` loads it. The extractor skips curriculum tables on purpose (it flags them `possible_curriculum_table`), so degree requirements are **not** extracted today. `pdftotext` is installed on the owner's machine.
- Work happens against **local Supabase** (Docker, `npx supabase start`). The hosted project (`udtdlctvckaaboycahuk`) has four migrations that this branch does not have (`20261024120000` and `20261024130000` exist on `origin/mohammed/sprint-3`; `20261028094821` and `20261028150000` are on no remote branch). `supabase db push` to hosted is blocked until those are resolved with the team. Do not run `supabase migration repair`. Pushing the new migrations to hosted is out of scope until then.
- Local email goes to the Inbucket inbox at `http://127.0.0.1:54324`. A local test account exists: `test.student@mail.aub.edu`.
- Local login and the app use `frontend/.env.local` (local Supabase URL and keys).

## Decisions the owner made

- The four kinds of question to get right: library hours, course questions, the graduation check, and course suggestions from stated interests.
- The student tells the assistant which courses they have taken; no records are stored.
- Degree requirements come from the public undergraduate and graduate catalogue, which AUB republishes every year.
- Graduation check covers Computer Science and Psychology only, because the owner wants interests (Psychology) to matter.
- Build order as listed above.

## The builder's calls (not yet agreed with the owner; flagged for review)

- Embeddings use Gemini's embedding model with the existing key, and vectors are stored in Supabase with `pgvector`.
- Search combines meaning and keyword results rather than replacing keywords.
- Import the whole catalogue for steps 1 to 3; restrict only the graduation check to the two majors.
- Every graduation answer states the catalogue year and that it is not an official audit.

## Owner decision on requirements data and trust (2026-10-30)

- The CS and Psychology requirements are extracted from the catalogue automatically. No person is required to review the extracted file before it ships.
- Instead, every graduation answer carries a plain disclaimer, shown with the answer and not hidden in small print, in words like: "This is a suggestion based on the courses you listed and the [year] catalogue. Please consult your advisor." Exact wording is the builder's, but it must say it is a suggestion and name the advisor.
- Because no person checks the data, the builder adds automatic sanity checks on the extracted requirements (for example: every required course code exists in the imported catalogue, credit totals add up, no empty sections) and fails the import loudly if they do not hold. The anti-goal about confident wrong statements about requirements still applies.

## Owner decision on how the graduation check starts (2026-10-30)

- A separate "check my progress" form, not the normal assistant chat: a major picker and a larger text box for the courses taken. The 500-character question limit does not apply to it, but it keeps its own length limit and rate limit.
- The form is generic. The owner expects other majors to follow, so the extractor, the requirements format and the sanity checks must work for any major, with Computer Science and Psychology as the first two loaded. Adding a major means running the extractor for it and passing the automatic checks; a faculty whose catalogue layout differs may need small parser changes.
- The major picker lists only majors whose requirements are loaded (builder's call, owner may overrule with a "coming soon" entry).

## Calls made after the builder check (mine, for the owner to check)

- **Embeddings are available.** The existing `GEMINI_API_KEY` can call `gemini-embedding-001` (checked 2026-10-30: HTTP 200, 3072-number vectors, about 0.6 s). `gemini-embedding-2` and a preview model also appear on the key. Quotas and cost for a full-catalogue backfill were not checked; check them first. The default vector size (3072) is larger than `pgvector` can index with its standard index type, so the builder should request a smaller size or use a half-precision column.
- **Who compares for the graduation check.** Code does the matching and counting against a structured requirements file; the model only words the result. Typed course codes are normalised (case, spacing, "CMPS271"). Anything code cannot judge goes in a "could not judge" list shown to the student: courses currently being taken, transfer or AP credit, unknown or cross-listed codes, and rules the file does not express. The model is not asked to decide whether a requirement is met.
- **How "reaches the stored answer" is measured.** A fixed set of about 25 example questions per kind (library hours once added, course questions, interest suggestions, graduation check), each with the source it should cite, run before and after. "On track" means a list of what is met and what remains. It does not depend on the student's year or semester.
- **Data in the repo.** The extracted course CSV and the requirements file for the two majors are committed under `supabase/data/` so teammates get the same data. Embeddings are filled in by a script run after ingest or import. The student's question is embedded at request time.
- **Failure behaviour.** If the embedding call fails or is slow, the assistant falls back to keyword-only search with a short separate timeout for the embedding call. The earlier retry-and-timeout proposal stays a separate change.
- **Catalogue year.** 2026-27 only. Every graduation answer names that year; a student on an older catalogue is told to check their own.

## Waiting on the owner

- Approval of this document.

## Left to the builder

- Exact embedding model and vector size, index type, how results are merged and ranked, chunking of the new requirement text.
- How the requirement sections are read and structured, and how "any two of" or "at least N credits from" rules are stored.
- Prompt wording, answer layout, tests, and how to roll embeddings out for pages already ingested.

## Known issues outside this design

- The first question sometimes shows "the assistant took too long". Gemini's response time swings from under 1 s to over 7 s, and the app gives it one 15 s try. A separate small change (retry once, raise the limit to about 25 s) was proposed and not yet approved.
- The local database still lists the deleted news migration (`20261025090000`) in its history. Harmless; `supabase db reset` clears it.

## Open question

- Whether the `courses` import should be limited to one academic year or keep earlier years for students on older catalogues. Default: 2026-27 only.
