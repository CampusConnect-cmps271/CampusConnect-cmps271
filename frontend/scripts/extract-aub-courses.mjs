/** SCRUM-166: official faculty PDFs -> reviewable CSV. No database writes. */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { buildCatalogue, catalogueURL, discoverAcademicUnits, discoverFacultyLinks, discoverFacultyPDF, extractCatalogueText, toCSV } from "./lib/aub-catalogue.mjs";

const execFileAsync = promisify(execFile);
const MAX_BYTES = 40 * 1024 * 1024;

async function fetchOfficial(url, year) {
  let current = catalogueURL(url, year);
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(120_000),
      headers: { "User-Agent": "CampusConnect-Catalogue-Extractor/1.0 (academic catalogue maintenance)" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      current = catalogueURL(new URL(response.headers.get("location"), current).href, year);
      continue;
    }
    if (!response.ok) throw new Error(`AUB returned HTTP ${response.status} for ${current}`);
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      await response.body?.cancel();
      throw new Error("Faculty source exceeds 40 MB; use an individual faculty PDF rather than the combined catalogue.");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > MAX_BYTES) throw new Error("AUB source exceeds the 40 MB limit.");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks);
  }
  throw new Error(`Too many redirects for ${url}`);
}

async function cachedPDF(source, cache, year, refresh, offline) {
  const path = join(cache, `${createHash("sha256").update(source.url).digest("hex")}.pdf`);
  if (!refresh) {
    try {
      const existing = await readFile(path);
      if (existing.subarray(0, 5).toString() === "%PDF-") return path;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (offline) throw new Error(`No cached PDF for ${source.url}; download it with an online run first.`);
  const buffer = await fetchOfficial(source.url, year);
  if (buffer.subarray(0, 5).toString() !== "%PDF-") throw new Error(`Expected a PDF, received another format at ${source.url}`);
  await writeFile(`${path}.tmp`, buffer);
  await rename(`${path}.tmp`, path);
  return path;
}

async function pdfText(path) {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"], {
      maxBuffer: 30 * 1024 * 1024, timeout: 120_000,
    });
    return stdout;
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Install Poppler's pdftotext (Ubuntu: sudo apt install poppler-utils) and retry.");
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    year: { type: "string", default: "2026-27" }, level: { type: "string", default: "all" },
    faculty: { type: "string" }, out: { type: "string" },
    pdf: { type: "string" }, "source-url": { type: "string" }, department: { type: "string" },
    refresh: { type: "boolean", default: false }, offline: { type: "boolean", default: false },
    "discover-only": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  } });
  if (values.help) {
    console.log(`Usage: npm run extract:courses -- [--year 2026-27] [--level all|ug|gr] [--faculty FAS] [--out directory]
  --discover-only  Discover faculty PDFs without downloading them
  --refresh        Redownload cached PDFs
  --offline        Reparse saved sources.json and cached PDFs without network access
  --pdf file.pdf --faculty "Faculty name" --level ug --source-url https://...pdf
                   Extract one downloaded PDF offline; --department can supply a reviewed academic unit`);
    return;
  }
  const yearMatch = /^(20\d{2})-(\d{2})$/.exec(values.year);
  if (!yearMatch || (Number(yearMatch[1]) + 1) % 100 !== Number(yearMatch[2])) throw new Error("Year must be consecutive, e.g. 2026-27.");
  if (!["all", "ug", "gr"].includes(values.level)) throw new Error("Level must be all, ug or gr.");
  if (values.offline && values.refresh) throw new Error("--offline cannot be combined with --refresh.");
  if (values.pdf && (!values.faculty || !values["source-url"] || values.level === "all")) {
    throw new Error("Offline PDF mode requires --faculty, --source-url and --level ug or gr.");
  }
  if (values.department && !values.pdf) throw new Error("--department is only for a reviewed single PDF, not an entire university catalogue.");
  const out = resolve(values.out || `../supabase/data/aub-catalogue/${values.year}`);
  const cache = join(out, "cache");
  await mkdir(cache, { recursive: true });
  if (!values["discover-only"]) await writeFile(join(out, "report.json"), JSON.stringify({
    status: "in_progress", year: values.year, coverage_verified: false,
    note: "An extraction run is in progress. Existing CSV files in this directory may be from an earlier run.",
  }, null, 2) + "\n");
  const sources = [];
  const failures = [];
  const indexes = [];
  if (values.pdf) {
    sources.push({ faculty: values.faculty, level: values.level,
      url: catalogueURL(values["source-url"], values.year), local_pdf: resolve(values.pdf), department: values.department });
  } else if (values.offline) {
    const saved = JSON.parse(await readFile(join(out, "sources.json"), "utf8"));
    if (saved.year !== values.year || !Array.isArray(saved.sources)) throw new Error("Saved sources do not match the requested year.");
    indexes.push(...(saved.indexes || []));
    failures.push(...(saved.failures || []));
    for (const source of saved.sources) {
      catalogueURL(source.url, values.year);
      if (values.level !== "all" && source.level !== values.level) continue;
      if (values.faculty && !source.faculty.toLowerCase().includes(values.faculty.toLowerCase())) continue;
      sources.push(source);
    }
  } else {
    for (const level of values.level === "all" ? ["ug", "gr"] : [values.level]) {
      const indexURL = `https://www.aub.edu.lb/Registrar/catalogue${values.year}/${level}/Pages/default.aspx`;
      console.log(`Discovering ${level} faculties for ${values.year}...`);
      try {
        const html = (await fetchOfficial(indexURL, values.year)).toString("utf8");
        const faculties = discoverFacultyLinks(html, indexURL, values.year);
        indexes.push({ level, url: indexURL, discovered_faculties: faculties.length });
        for (const faculty of faculties) {
          if (values.faculty && !faculty.faculty.toLowerCase().includes(values.faculty.toLowerCase())) continue;
          try {
            const page = (await fetchOfficial(faculty.landing_url, values.year)).toString("utf8");
            sources.push({ ...faculty, level, url: discoverFacultyPDF(page, faculty.landing_url, values.year),
              units: discoverAcademicUnits(page, faculty.landing_url, values.year) });
          } catch (error) { failures.push({ ...faculty, level, stage: "discovery", error: error.message }); }
        }
      } catch (error) { failures.push({ level, url: indexURL, stage: "index", error: error.message }); }
    }
  }
  await writeFile(join(out, "sources.json"), JSON.stringify({ year: values.year, indexes, sources, failures }, null, 2) + "\n");
  if (values["discover-only"]) {
    console.log(`Discovered ${sources.length} faculty PDFs; ${failures.length} failures. See ${join(out, "sources.json")}`);
    if (failures.length || sources.length === 0) process.exitCode = 1;
    return;
  }
  const extractions = [];
  const sourceResults = [];
  for (const source of sources) {
    console.log(`Extracting ${source.level}: ${source.faculty}...`);
    try {
      const path = source.local_pdf || await cachedPDF(source, cache, values.year, values.refresh, values.offline);
      const text = await pdfText(path);
      const yearPattern = new RegExp(`${yearMatch[1]}\\s*[-–]\\s*(?:20)?${yearMatch[2]}`);
      if (!yearPattern.test(text)) throw new Error("The PDF text does not identify the requested academic year; verify the source manually.");
      const extraction = extractCatalogueText(text, source);
      const digest = createHash("sha256").update(await readFile(path)).digest("hex");
      extractions.push(extraction);
      sourceResults.push({ ...source, sha256: digest, pages: text.split("\f").length - (text.endsWith("\f") ? 1 : 0),
        candidates: extraction.records.length, unparsed_course_like_lines: extraction.warnings.length });
      if (!extraction.records.length) failures.push({ ...source, stage: "parsing", error: "No recognizable course descriptions; source requires manual review or OCR." });
    } catch (error) {
      failures.push({ ...source, stage: "extraction", error: error.message });
      console.error(`  ${error.message}`);
    }
  }
  const result = buildCatalogue(extractions);
  const report = { status: failures.length ? "partial" : "draft", year: values.year, generated_at: new Date().toISOString(),
    scope: values.pdf ? "single_pdf" : values.faculty ? "selected_faculty" : values.level,
    coverage_verified: false,
    note: "Automated extraction is a draft. Review source failures, unmatched lines and excluded records, and check coverage against official catalogues before importing.",
    ready_courses: result.courses.length, review_courses: result.review.length,
    unmatched_lines: result.warnings.length, source_failures: failures,
    department_counts: Object.fromEntries([...new Set(result.courses.map((course) => course.department))].sort()
      .map((department) => [department, result.courses.filter((course) => course.department === department).length])),
    sources: sourceResults };
  for (const [name, content] of [
    ["courses.csv", toCSV(result.courses)], ["provenance.json", JSON.stringify(result.provenance, null, 2) + "\n"],
    ["review.json", JSON.stringify({ courses: result.review, unmatched_lines: result.warnings }, null, 2) + "\n"],
    ["report.json", JSON.stringify(report, null, 2) + "\n"],
  ]) {
    await writeFile(join(out, `${name}.tmp`), content);
    await rename(join(out, `${name}.tmp`), join(out, name));
  }
  console.log(`Ready: ${result.courses.length}; need review: ${result.review.length}; unmatched lines: ${result.warnings.length}; source failures: ${failures.length}.`);
  console.log(`Draft files: ${out}\nNo database writes were performed. Check report.json and review.json before importing courses.csv.`);
  if (failures.length || result.courses.length === 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`extract:courses failed: ${error.message}`); process.exitCode = 1; });
}
