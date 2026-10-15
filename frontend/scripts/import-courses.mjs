/** SCRUM-166: validate a catalogue CSV, then upsert by stable course code. */
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const COLUMNS = ["code", "name", "description", "credits", "prerequisites", "department"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const courseSchema = z.object({
  code: z.string().transform((value) => value.trim().replace(/\s+/g, " ").toUpperCase())
    .pipe(z.string().min(1).max(32)),
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(20000),
  credits: z.string().trim().regex(/^\d{1,3}(?:\.\d{1,2})?$/, "Use a non-negative number with up to two decimals")
    .transform(Number).pipe(z.number().finite().min(0).max(999.99)),
  prerequisites: z.string().trim().max(10000),
  department: z.string().trim().min(1).max(200),
});

// Quoted commas, escaped quotes and multiline fields are common in catalogue
// descriptions. Reject malformed quoting instead of silently shifting columns.
function csvRecords(source) {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const records = [];
  let row = [];
  let field = "";
  let state = "plain";

  function finishField() {
    row.push(field);
    field = "";
    state = "plain";
  }

  function finishRow() {
    finishField();
    if (row.length !== 1 || row[0].trim() !== "") records.push(row);
    row = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (state === "quoted") {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        state = "closed";
      } else {
        field += char;
      }
    } else if (char === ",") {
      finishField();
    } else if (char === "\n") {
      finishRow();
    } else if (state === "closed") {
      throw new Error(`CSV record ${records.length + 1}: unexpected character after closing quote.`);
    } else if (char === '"') {
      if (field !== "") throw new Error(`CSV record ${records.length + 1}: quote inside an unquoted field.`);
      state = "quoted";
    } else {
      field += char;
    }
  }

  if (state === "quoted") throw new Error("CSV has an unterminated quoted field.");
  finishRow();
  return records;
}

export function parseCourseCatalogue(source) {
  if (source.includes("\0")) throw new Error("CSV must not contain NUL characters.");
  const [rawHeaders, ...records] = csvRecords(source);
  const headers = rawHeaders?.map((header) => header.trim());
  if (!headers || headers.length !== COLUMNS.length ||
      new Set(headers).size !== COLUMNS.length ||
      COLUMNS.some((column) => !headers.includes(column))) {
    throw new Error(`CSV needs exactly these headers (any order): ${COLUMNS.join(",")}.`);
  }
  if (records.length === 0) throw new Error("CSV contains no courses.");

  const seen = new Set();
  return records.map((record, index) => {
    if (record.length !== headers.length) {
      throw new Error(`CSV record ${index + 2}: expected ${headers.length} fields, received ${record.length}.`);
    }
    const result = courseSchema.safeParse(Object.fromEntries(headers.map((header, i) => [header, record[i]])));
    if (!result.success) {
      const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`CSV record ${index + 2}: ${details}.`);
    }
    const course = result.data;
    if (seen.has(course.code)) throw new Error(`CSV record ${index + 2}: duplicate course code ${course.code}.`);
    seen.add(course.code);
    return course;
  });
}

export function resolveImportTarget(env, hosted = false) {
  const urlName = hosted ? "HOSTED_SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_URL";
  const keyName = hosted ? "HOSTED_SUPABASE_SECRET_KEY" : "SUPABASE_SECRET_KEY";
  if (!env[urlName]?.trim() || !env[keyName]?.trim()) {
    throw new Error(`Set ${urlName} and ${keyName} in ${hosted ? ".env.hosted.local" : ".env.local"}.`);
  }
  const url = new URL(env[urlName].trim());
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Supabase URL must be an origin without credentials, path, query or fragment.");
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (!hosted && (!local || !["http:", "https:"].includes(url.protocol))) {
    throw new Error("Local imports require a loopback Supabase URL. Use --hosted for a hosted project.");
  }
  if (hosted && (url.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname))) {
    throw new Error("Hosted imports require https://<project-ref>.supabase.co.");
  }
  return { url: url.origin, key: env[keyName].trim(), projectRef: url.hostname.split(".")[0] };
}

export async function importCourses(client, courses, { batchSize = 200, onBatch = () => {} } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Batch size must be a positive integer.");
  let imported = 0;
  for (let offset = 0; offset < courses.length; offset += batchSize) {
    const batch = courses.slice(offset, offset + batchSize);
    const { error } = await client.from("courses").upsert(batch, { onConflict: "code" });
    if (error) {
      // Provider messages can echo values. Report progress and the error code,
      // never the secret key or the raw provider response.
      throw new Error(`Import stopped after ${imported} courses (database code: ${error.code ?? "unknown"}). Check the migration and credentials, then rerun the CSV.`);
    }
    imported += batch.length;
    onBatch(imported);
  }
  return imported;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      hosted: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log("Usage: npm run import:courses -- <catalogue.csv> [--dry-run] [--hosted]");
    return;
  }
  if (positionals.length !== 1) throw new Error("Supply one CSV path. Use --help for usage.");

  // Validate the entire file before opening a connection or writing any rows.
  const courses = parseCourseCatalogue(await readFile(positionals[0], "utf8"));
  console.log(`Validated courses: ${courses.length}; departments: ${new Set(courses.map((course) => course.department)).size}.`);
  if (values["dry-run"]) {
    console.log("Dry run complete; no database connection or writes.");
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
  if (values.hosted) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const confirmation = await prompt.question(`Type project ref ${target.projectRef} to import/update this hosted catalogue: `);
      if (confirmation.trim() !== target.projectRef) throw new Error("Project ref did not match; import cancelled.");
    } finally {
      prompt.close();
    }
  }

  const client = createClient(target.url, target.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const imported = await importCourses(client, courses, {
    onBatch: (count) => console.log(`Imported ${count}/${courses.length} courses.`),
  });
  console.log(`Complete: ${imported} courses upserted by code. Courses absent from the CSV were kept.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`import:courses failed: ${error.message}`);
    process.exitCode = 1;
  });
}
