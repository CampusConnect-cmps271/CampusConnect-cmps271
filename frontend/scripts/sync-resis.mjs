import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { queryResis } from "./lib/resis-client.mjs";
import { parseResisSemesters, buildResisSnapshot, importResisSnapshot } from "./lib/resis-catalogue.mjs";
import { resolveImportTarget } from "./import-courses.mjs";

// Fixed path: changing CWD cannot accidentally reset the request budget.
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(frontend, ".resis-cache");
async function cached(name) { return JSON.parse(await readFile(join(cacheDir, name), "utf8")); }

export async function main() {
  const { values } = parseArgs({ options: {
    semesters: { type: "boolean" }, semester: { type: "string" },
    offline: { type: "boolean" }, apply: { type: "boolean" }, hosted: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  }});
  if (values.help) {
    console.log("Usage: npm run sync:resis -- --semesters | --semester <ID> [--offline] [--apply] [--hosted]\nWithout --apply, only a validated local snapshot is prepared. --offline never contacts Resis.");
    return;
  }
  if (Boolean(values.semesters) === Boolean(values.semester)) throw new Error("Choose --semesters OR --semester <ID>.");
  if (values.semesters && values.apply) throw new Error("Use --apply only with a selected semester.");
  if (values.semester && !/^\d{6}$/.test(values.semester)) throw new Error("Supply a six-digit semester ID.");
  if (values.semesters) {
    const r = values.offline ? await cached("semesters.json") : await queryResis({ key: process.env.RESIS_API_KEY, method: "listSemesters", cacheDir });
    console.log(JSON.stringify(parseResisSemesters(r.data), null, 2));
    return;
  }
  // Require a separately fetched semester list. No hidden second request.
  const semesters = parseResisSemesters((await cached("semesters.json")).data);
  if (!semesters.some((s) => s.id === values.semester)) throw new Error("Selected semester is absent from the saved semester list.");
  const r = values.offline ? await cached(`semester-${values.semester}.json`) : await queryResis({ key: process.env.RESIS_API_KEY,
    method: "getSemester", semesterId: values.semester, cacheDir });
  const snapshot = buildResisSnapshot(r, semesters);
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  await writeFile(join(cacheDir, `snapshot-${values.semester}.json`), JSON.stringify(snapshot) + "\n", { mode: 0o600 });
  console.log(`${snapshot.semester.name}: ${snapshot.courses.length} courses, ${snapshot.section_count} sections. ${values.offline || r.cached ? "Saved data used; no Resis request." : "One Resis request used."}`);
  if (!values.apply) { console.log("Validated locally; no database writes. Add --offline --apply to import this saved response."); return; }
  if (values.hosted) {
    try { process.loadEnvFile(join(frontend, ".env.hosted.local")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const target = resolveImportTarget(process.env, values.hosted);
  const client = createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await importResisSnapshot(client, snapshot);
  console.log(`${result.unchanged ? "Already active" : "Imported"}: ${result.courses} courses at ${target.url}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`sync:resis failed: ${error.message}`); process.exitCode = 1; });
}
