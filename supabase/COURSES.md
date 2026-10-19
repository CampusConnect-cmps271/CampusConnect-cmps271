# Course catalogue import — SCRUM-166

The catalogue lives in `public.courses` in Supabase Postgres. Signed-in students
can read it through RLS; ordinary clients cannot insert, update, delete or
truncate courses. The maintenance importer uses a server-only secret key.

## Apply the migration

From `frontend/`, with the local Supabase stack running:

```bash
npx supabase migration up --local
```

The migration is **already applied** to the CampusConnect hosted project
(`udtdlctvckaaboycahuk`) as `20261017091812_create_courses` on October 17, 2026.
Do not run it again there. The local filename now matches Supabase's recorded
version so future deployments will recognize it as applied.

For another project, apply
[`20261017091812_create_courses.sql`](migrations/20261017091812_create_courses.sql)
through its reviewed migration process. The importer requires the migration
to have been applied. The hosted CampusConnect table is ready but has no
catalogue rows yet; an authoritative CSV still needs to be imported.

## Prepare the CSV

Use a UTF-8 CSV with exactly these six column names, in any order:

```csv
code,name,description,credits,prerequisites,department
```

- `code`: unique, at most 32 characters; trimmed, whitespace collapsed, uppercased.
- `name`: required, at most 300 characters.
- `description`: required, at most 20,000 characters.
- `credits`: non-negative decimal, up to two decimal places, at most 999.99.
- `prerequisites`: may be empty, at most 10,000 characters. Keep the catalogue's
  original prerequisite expression, including AND/OR and permission requirements.
- `department`: required, at most 200 characters.

Quote fields containing commas, newlines or double quotes. Escape a double quote
inside a quoted field as `""`. BOM, CRLF and Arabic text are supported. Duplicate
codes after normalization, missing fields, malformed quotes and invalid values
fail validation before any database write. Errors identify CSV record numbers;
a multiline quoted field still belongs to one record.

[`data/courses.example.csv`](data/courses.example.csv) is **synthetic test data**,
not an official AUB catalogue. For a real import, prepare a CSV from the public
university catalogue and verify its content and academic year first. No official
catalogue CSV was supplied with this task, and none is bundled here.

## Validate and import

Run from `frontend/`. Validation needs no credentials or running database:

```bash
npm run import:courses -- ../supabase/data/courses.example.csv --dry-run
```

For a local import, put `NEXT_PUBLIC_SUPABASE_URL` (a loopback URL) and
`SUPABASE_SECRET_KEY` in `.env.local`, then:

```bash
npm run import:courses -- /path/to/catalogue.csv
```

For a hosted import, put `HOSTED_SUPABASE_URL` and
`HOSTED_SUPABASE_SECRET_KEY` in the ignored `.env.hosted.local` file, then:

```bash
npm run import:courses -- /path/to/catalogue.csv --hosted
```

Hosted mode requires an HTTPS `https://<project-ref>.supabase.co` URL and asks
you to type the project ref before writing. It never falls back to local keys.
Keep secret keys out of `NEXT_PUBLIC_*` variables, CSV files and browser code.

Imports upsert in batches of 200 using unique `code`. Reimporting updates the
six catalogue fields while preserving existing IDs and creation times; courses
absent from the file are retained. Changing a code creates a new course rather
than renaming an existing record.

Each batch is atomic, **the entire import is not**. On failure, earlier batches
remain committed. Correct the issue and rerun the complete CSV; successful rows
will be updated rather than duplicated. Progress reports rows processed, not a
separate count of inserts versus updates.

## Verification

`npm run test:db` includes CSV parsing, target selection, real Supabase SDK
request construction and PGlite database checks for schema constraints, stable
IDs on reimport, RLS and denied client writes. Tests use synthetic data and do
not connect to hosted Supabase.

Implementation references: [Supabase upsert](https://supabase.com/docs/reference/javascript/upsert)
and [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
