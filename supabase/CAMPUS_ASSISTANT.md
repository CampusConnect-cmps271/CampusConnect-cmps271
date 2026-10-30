# Campus assistant data — pages, courses and embeddings

The assistant at `/assistant` answers from two kinds of stored text: chunks of
official AUB pages (`campus_source_chunks`) and catalogue courses (`courses`).
Each row can carry an **embedding**, a list of 768 numbers that places its
meaning, so a question worded differently from the text still finds it. Search
runs the keyword functions and the meaning functions together and merges the
results; if embedding a question fails, the keyword results are used alone.

Run everything from `frontend/`, against the local Supabase stack
(`npx supabase start`). Commands are in the order they depend on each other.

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

## Not yet done

- **Hosted Supabase:** the hosted project has four migrations this repository
  does not (`20261024120000`, `20261024130000`, `20261028094821`,
  `20261028150000`), so `supabase db push` is blocked until the team resolves
  them. Do not run `supabase migration repair` against hosted.
