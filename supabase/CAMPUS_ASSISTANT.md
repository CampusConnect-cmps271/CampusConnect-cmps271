# Campus assistant data — pages, courses, clubs, events and embeddings

The assistant at `/assistant` answers from four kinds of stored text: chunks of
official AUB pages (`campus_source_chunks`), catalogue courses (`courses`),
verified student clubs (`clubs`) and upcoming events (`events`). Each row can
carry an **embedding**, a list of 768 numbers that places its meaning, so a
question worded differently from the text still finds it. Search runs the
keyword functions and the meaning functions together and merges the results; if
embedding a question fails, the keyword results are used alone.

**Clubs and events (SCRUM-254)** come from the app's own tables, so there is
nothing to load: they are searched as soon as they exist and are embedded by
step 2. Only what students may be told is searched, whatever the table's read
policy allows:

| Kind | Searched | Never searched |
|---|---|---|
| Clubs | `verification_status = 'verified'` | pending and rejected clubs |
| Events | `status = 'published'` and `ends_at` not yet passed | drafts, cancelled and past events |

The embedding script applies the same filter, so an unpublished draft or an
unverified club is never sent to Gemini. A club that is verified, or an event
that is published, after the last run has no embedding yet: it is still found by
keyword search straight away, and by meaning after the next
`npm run embed:campus-content`. Answers link to `/clubs/<slug>` and
`/events/<id>`. Club and event search only add to an answer: if the
`20261112100000` migration is missing on a project, pages and courses still
answer. News is not indexed (cancelled for this sprint).

Run everything from `frontend/`, against the local Supabase stack
(`npx supabase start`). Commands are in the order they depend on each other.

## The student's own context (SCRUM-255)

For a question about the student themselves ("what is on my schedule today?",
"which events did I save?") the assistant also reads that student's **own**
semester plan, saved and going events, saved posts and posts, plus the newest
public posts, and the answer can cite them. This data is handled differently
from everything above, because it is private:

| Rule | How it is kept |
|---|---|
| Only the student's own rows | Read at request time with **their own session**, so row-level security hides every other student; each query also asks for their id explicitly. `tests/campus-assistant-student-context.test.ts` proves it with two real students, including a caller who names someone else's id. |
| Only when needed | `modules/campus-assistant/personal.ts` asks for a first-person word **and** a topic ("my schedule", "did I save"). Library hours or transcripts never carry a timetable. A vague follow-up counts as personal if the question before it was. It is a narrow heuristic: a missed question gets a less personal answer, never a leak. |
| Never stored | Nothing private is written to the search index or embedded. It exists for one request. `embed:campus-content` never touches these tables. |
| Short fields only | Titles, categories and times; never post bodies. Lists are capped (2 plans, 10 events and upcoming items, 10 saved posts, 5 own posts, 5 feed posts). |
| Typed text is data | A plan item or post title is flattened to one capped line, escaped like any evidence, and the system prompt calls it data, never instructions. |
| Not logged | Logs carry only how many private parts were attached (`private_parts`) and the names of parts that failed, never their content. |
| Fails soft | A part that cannot be read is skipped; the rest of the answer still works. |

Citations point at `/planner/<id>` (the plan) or the list pages `/events`,
`/saved`, `/profile` and `/home`, which are the only app pages `isCitableUrl`
allows besides courses, clubs and single events. Plan meeting times are typed by
the student, so the model is told they are tentative.

What is sent to the answer model (Gemini) for a personal question is therefore
that student's plan, saved events, post titles and the recent feed. Tell students
this in the privacy notice before the assistant is announced.

## 1. Load the data

| Command | What it does |
|---|---|
| `npm run ingest:campus-sources` | Downloads the pages listed in `supabase/data/campus-sources.json` and stores their text in chunks. |
| `npm run extract:courses -- --year 2026-27` | Downloads AUB's faculty catalogue PDFs and writes a draft `courses.csv` plus `report.json` and `review.json` into `supabase/data/aub-catalogue/2026-27/`. Network access needed; takes a few minutes. |
| `npm run import:courses -- ../supabase/data/aub-catalogue/2026-27/courses.csv` | Validates and imports the courses (add `--dry-run` first). See [COURSES.md](COURSES.md). |

`supabase/data/aub-catalogue/` is git-ignored, so each person regenerates it
with `extract:courses`. The extractor marks courses it is unsure about as
"need review" (about a quarter of them for 2026-27); those are not in
`courses.csv` and are not imported.

**Text written by hand.** A source in `campus-sources.json` can carry its own
`text` instead of being downloaded (it cannot also use `start_after` or
`end_before`). The library opening hours are kept this way (`library-hours`),
because the AUB page loads its hours with JavaScript, so they are not in the
page's text. The `url` is the page students are sent to for checking, and the
text says when it was supplied. **Hours change each term:** edit the `text` of
`library-hours`, then run `npm run ingest:campus-sources` and
`npm run embed:campus-content`; the changed chunk's old embedding is cleared
automatically.

## 2. Embed it

```bash
npm run embed:campus-content            # only rows with no embedding yet
npm run embed:campus-content -- --dry-run
npm run embed:campus-content -- --all   # embed everything again (e.g. a new model)
```

- Rows are embedded in batches of 100 and each batch is saved before the next,
  so the command can be stopped and run again: it continues where it stopped.
- **Gemini's free tier limits this.** It allows about 100 texts a minute (and a
  token limit on top), so the 2,400 courses take well over half an hour, and
  there may be a daily cap. The command waits when Google says to, and stops
  with "daily embedding quota is used up" if the day's quota is gone. Run it
  again the next day; nothing is lost.
- When a page chunk's text, or a course's name, description or department,
  changes, the database clears that row's embedding (a trigger from the
  `20261030100000` migration). Run the command again to embed the changed rows.
- The question itself is embedded at request time by the app
  (`modules/campus-assistant/embeddings.ts`), with a 5 second limit.

Environment: `GEMINI_API_KEY` in `frontend/.env`; optional
`CAMPUS_ASSISTANT_EMBEDDING_MODEL` (default `gemini-embedding-001`; the vector
size, 768, is fixed by the database columns).

## 3. Measure it

```bash
npm run eval:assistant
```

Runs the questions in `modules/campus-assistant/eval/questions.json` (page,
course and interest questions, plus questions that should find nothing) through
the app's own retrieval, with keyword search alone and with meaning search added,
and prints how much of the expected evidence reached the model. It needs local
Supabase, `GEMINI_API_KEY`, and the content embedded (step 2); it is not part of
`npm test`. Add questions to the file as you find ones that fail; each expected
id is a chunk id (`electronic-transcripts:0`) or `course:CODE`.

The similarity floor (`p_min_similarity`, default 0.5 in the two
`search_campus_*_semantic` functions) keeps an unrelated question from matching
its nearest neighbour. If unrelated questions return evidence, raise it in a new
migration with `create or replace function`; if good questions find nothing,
lower it.

## 4. Privacy and answer-quality tests (SCRUM-257)

`npm test` runs these with the unit tests; the database-backed ones skip themselves
when local Supabase is not running (`npx supabase start`, then
`npx supabase migration up --include-all` if tables are missing).

| Test | What it proves |
|---|---|
| `tests/api/campus-assistant-privacy.test.ts` | The real route, real database and real row-level security, with two signed-in students. Only the model call is stubbed, and the stub *cites everything it is sent*, so anything that reached the model also shows in the response. For a personal question each student's request holds their own plan, timetable and saved events and none of the other's, and the response to the browser is the same. A question that is not personal carries no private data. A **draft event never reaches the model, not even for its own organizer**, and a **pending club never does**, though every student can read both. Text one student typed into their plan cannot reach or steer the other. A signed-out visitor is refused, and the logs never hold private text. |
| `tests/campus-assistant-student-context.test.ts` | The loader on its own, including a caller who names another student's id: row-level security is the lock, the explicit filter the second. |
| `tests/campus-assistant-clubs-events.test.mjs` | The four club and event search functions (see above). |
| `modules/campus-assistant/*.test.ts` | Unit tests: which questions count as personal, the shape and caps of the private context, that typed text cannot pose as an instruction, that every kind of evidence is cited with its own label, and that an answer can only cite what was retrieved for that question. |

These tests were checked by breaking things on purpose: removing the
personal-question gate, the draft filter or the pending-club filter makes the
privacy test fail, and so does dropping any student filter in the loader.

**Not covered: how good the model's answers are.** None of this calls the real
model. Whether Gemini phrases an answer well, or stays inside the excerpts it
was given, can only be judged with a `GEMINI_API_KEY`: run
`npm run eval:assistant` for retrieval recall (it now counts clubs and events),
and read real answers by hand before relying on them. Add club and event
questions to `eval/questions.json` once real clubs and events exist locally.

## Not yet done

- **Embedding events bumps their revision.** `enforce_event_management` raises
  an event's `revision` (and `updated_at`) on every update, including the
  backfill, which only sets `embedding`. An organizer with that event's edit form
  open while `embed:campus-content` runs would get a stale-write conflict on
  save. Run the backfill off-hours until that trigger is made to ignore
  embedding-only updates.
- **The club/event migration and tests were written without a running local
  stack.** `tests/campus-assistant-clubs-events.test.mjs` skips itself unless
  `npx supabase start` is up; run `npm run test:db` once with it running before
  merging, to apply `20261112100000` and exercise the four new functions.

- **Hosted Supabase:** the hosted project has four migrations this repository
  does not (`20261024120000`, `20261024130000`, `20261028094821`,
  `20261028150000`), so `supabase db push` is blocked until the team resolves
  them. Do not run `supabase migration repair` against hosted.
