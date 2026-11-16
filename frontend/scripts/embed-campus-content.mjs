/**
 * Embeds the stored campus page chunks, catalogue courses, verified clubs and
 * published events so the assistant can search them by meaning. Run it after
 * ingest:campus-sources and import:courses, and again whenever clubs are verified
 * or events are published. By default it embeds only rows that have no embedding yet
 * (new rows, and rows whose text changed, which the database clears); --all
 * embeds everything again, for example after changing the embedding model.
 */
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { resolveImportTarget } from "./import-courses.mjs";
import { embedTexts, MAX_BATCH } from "./lib/gemini-embed.mjs";

const PAGE_SIZE = 1000;
const WRITE_CONCURRENCY = 25;
const COURSE_TEXT_MAX_CHARS = 2000;

/** A page chunk is embedded as it is stored. */
export function chunkEmbeddingText(chunk) {
  return chunk.text;
}

/** Code and name first, since students ask by both; cut to a size the model handles well. */
export function courseEmbeddingText({ code, name, department, description }) {
  return `${code} ${name}. ${department}. ${description}`.slice(0, COURSE_TEXT_MAX_CHARS);
}

const CLUB_TEXT_MAX_CHARS = 2000;
const EVENT_TEXT_MAX_CHARS = 2000;

/** Name first, since students ask by it, then the kind of club and what it does. */
export function clubEmbeddingText({ name, category, description }) {
  return `${name}. ${category} club. ${description}`.slice(0, CLUB_TEXT_MAX_CHARS);
}

/** Title and organising club first, then kind and place, then the description. Dates are not embedded: they are read from the row when the event is retrieved. */
export function eventEmbeddingText({ title, club_name, category, location, description }) {
  const organiser = club_name ? ` Organised by ${club_name}.` : "";
  return `${title}.${organiser} ${category} event at ${location}. ${description}`.slice(0, EVENT_TEXT_MAX_CHARS);
}

/**
 * Each table to embed, the column that identifies a row, the columns the text is
 * built from and `only`, a filter that keeps unpublished text away from the
 * embedding service: a draft event or a club still awaiting verification is
 * never sent, and the assistant's search functions would not return it anyway.
 */
const TABLES = {
  campus_source_chunks: { key: "id", columns: "id, text", toText: chunkEmbeddingText },
  courses: { key: "code", columns: "code, name, department, description", toText: courseEmbeddingText },
  clubs: {
    key: "id",
    columns: "id, name, category, description",
    toText: clubEmbeddingText,
    only: { verification_status: "verified" },
  },
  events: {
    key: "id",
    columns: "id, title, description, location, category, club_name",
    toText: eventEmbeddingText,
    only: { status: "published" },
  },
};

const fail = (what, error) => new Error(`${what} failed (database code: ${error.code ?? "unknown"}).`);

/** Every row of the table that still needs an embedding (or every row, with `all`). */
export async function pendingRows(client, table, all) {
  const { key, columns, only = {} } = TABLES[table];
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client.from(table).select(columns);
    for (const [column, value] of Object.entries(only)) query = query.eq(column, value);
    if (!all) query = query.is("embedding", null);
    const { data, error } = await query.order(key).range(from, from + PAGE_SIZE - 1);
    if (error) throw fail(`reading ${table}`, error);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

/**
 * Embeds the pending page chunks, courses, verified clubs and published events.
 * `embed` turns a list of texts into a list of vectors. With `dryRun` nothing is
 * embedded or written. Returns how many rows of each kind were (or, in a dry run,
 * would be) embedded.
 */
export async function runEmbedding(client, { dryRun, all, embed }) {
  const counts = { chunks: 0, courses: 0, clubs: 0, events: 0 };
  for (const [table, name] of [
    ["campus_source_chunks", "chunks"],
    ["courses", "courses"],
    ["clubs", "clubs"],
    ["events", "events"],
  ]) {
    const { key, toText } = TABLES[table];
    const rows = await pendingRows(client, table, all);
    counts[name] = rows.length;
    if (dryRun || rows.length === 0) continue;

    // One batch at a time, saved before the next is embedded: a rate limit or a
    // daily quota mid-way keeps what is done, and a rerun picks up the rest.
    for (let start = 0; start < rows.length; start += MAX_BATCH) {
      const batch = rows.slice(start, start + MAX_BATCH);
      const vectors = await embed(batch.map(toText));
      for (let from = 0; from < batch.length; from += WRITE_CONCURRENCY) {
        await Promise.all(batch.slice(from, from + WRITE_CONCURRENCY).map(async (row, offset) => {
          const { error } = await client.from(table).update({ embedding: `[${vectors[from + offset].join(",")}]` }).eq(key, row[key]);
          if (error) throw fail(`saving an embedding for ${table} ${row[key]}`, error);
        }));
      }
      console.log(`${name}: ${Math.min(start + MAX_BATCH, rows.length)}/${rows.length} embedded`);
    }
  }
  return counts;
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      hosted: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("Usage: npm run embed:campus-content [-- --dry-run] [--all] [--hosted]");
    return;
  }

  if (values.hosted) {
    try {
      process.loadEnvFile(".env.hosted.local");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const target = resolveImportTarget(process.env, values.hosted);
  console.log(`Target: ${target.url}`);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey && !values["dry-run"]) throw new Error("Set GEMINI_API_KEY in .env or .env.local.");

  if (values.hosted && !values["dry-run"]) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const confirmation = await prompt.question(`Type project ref ${target.projectRef} to embed this hosted project's content: `);
      if (confirmation.trim() !== target.projectRef) throw new Error("Project ref did not match; embedding cancelled.");
    } finally {
      prompt.close();
    }
  }

  const client = createClient(target.url, target.key, { auth: { autoRefreshToken: false, persistSession: false } });
  const counts = await runEmbedding(client, {
    dryRun: values["dry-run"],
    all: values.all,
    embed: (texts) => embedTexts(texts, { apiKey, taskType: "RETRIEVAL_DOCUMENT" }),
  });
  console.log(
    `${values["dry-run"] ? "Dry run: would embed" : "Complete:"} ${counts.chunks} chunks, ${counts.courses} courses, ` +
      `${counts.clubs} clubs and ${counts.events} events.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`embed:campus-content failed: ${error.message}`);
    process.exitCode = 1;
  });
}
