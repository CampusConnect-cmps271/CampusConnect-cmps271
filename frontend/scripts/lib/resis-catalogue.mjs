import { createHash } from "node:crypto";

function text(value, label, max = 10000) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > max) throw new Error(`Invalid Resis ${label}.`);
  return value.trim();
}
const unique = (values) => [...new Set(values)].sort();
function strings(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid Resis ${label}.`);
  return unique(value.map((item) => text(item, label, 300)));
}
function prerequisite(value) {
  if (typeof value === "string") return value.trim() || null;
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return null;
  // Observed API shape when Banner has no textual requirement available.
  if (typeof value === "object" && !Array.isArray(value) && Object.values(value).every((v) => Array.isArray(v) && v.length === 0)) return null;
  throw new Error("Unrecognized Resis prerequisite structure; review the saved response before importing.");
}
function timestamp(value) {
  if (!value) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("Invalid Resis source timestamp.");
  return new Date(value).toISOString();
}
function instructor(value) {
  return text(value, "instructor", 300).replace(/\s*\(P\)\s*$/, "");
}

export function parseResisSemesters(data) {
  if (!Array.isArray(data) || !data.length) throw new Error("Invalid Resis semester list.");
  const rows = data.map((s) => ({ id: String(s.semesterID), name: text(s.semesterName, "semester name", 100), source_updated_at: timestamp(s.lastUpdate) }));
  if (rows.some((s) => !/^\d{6}$/.test(s.id)) || new Set(rows.map((s) => s.id)).size !== rows.length) throw new Error("Invalid or duplicate Resis semester IDs.");
  return rows;
}

/** Exact API fields verified against saved Fall/Spring responses, not guessed aliases. */
export function buildResisSnapshot(envelope, semesters) {
  if (envelope.uniId !== "1" || envelope.method !== "getSemester" || !Number.isFinite(envelope.fetchedAt)) throw new Error("Expected a cached AUB getSemester response.");
  const semester = semesters.find((s) => s.id === envelope.semesterId);
  if (!semester) throw new Error("Semester is absent from the verified semester list.");
  if (!envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data)) throw new Error("Expected Resis sections keyed by CRN.");
  const groups = new Map();
  const entries = Object.entries(envelope.data);
  if (!entries.length || entries.length > 50000) throw new Error("Unexpected Resis section count; existing data will be kept.");
  for (const [key, row] of entries) {
    const subject = text(row.subject, "subject", 8).toUpperCase();
    const num = text(row.num, "course number", 6).toUpperCase();
    if (!/^[A-Z]{2,8}$/.test(subject) || !/^\d{3,4}[A-Z]{0,3}$/.test(num)) throw new Error("Unrecognized Resis course code; review the saved response.");
    if (row.crn !== key || !/^\d+$/.test(key)) throw new Error("Resis CRN does not match its section key.");
    const credits = Number(row.credits);
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(row.credits)) || !Number.isFinite(credits) || credits < 0 || credits > 999.99) throw new Error("Invalid Resis credits.");
    if (!Array.isArray(row.sessions)) throw new Error("Invalid Resis sessions.");
    const sessions = row.sessions.map((s) => {
      const result = {};
      for (const field of ["days", "start", "end", "type", "location", "instructor"]) {
        if (s[field] !== undefined && typeof s[field] !== "string") throw new Error("Invalid Resis meeting field.");
        result[field] = s[field] ?? "";
      }
      return result;
    });
    const instructors = unique([row.mainProf, ...sessions.map((s) => s.instructor)].filter(Boolean).map(instructor));
    let detailsURL = null;
    if (row.detailsURL) {
      const url = new URL(row.detailsURL);
      if (url.protocol === "https:" && url.hostname === "www-banner.aub.edu.lb" && !url.username && !url.password) detailsURL = url.href;
    }
    const connected = strings(row.connected, "connected CRNs");
    if (connected.some(crn => !/^\d+$/.test(crn))) throw new Error("Invalid connected CRN.");
    const connectedLabels = connected.flatMap(crn => { const target=envelope.data[crn]; return target ? [`${target.subject} ${target.num} · Section ${target.section} · ${unique(target.sessions.map(s=>s.type).filter(Boolean)).join(" / ") || "Type unlisted"} · CRN ${crn}`] : []; });
    const section = { connected_labels: connectedLabels, connected_crns: connected, crn: key, section: text(row.section, "section", 40), title: text(row.title, "title", 300),
      credits, instructors, attributes: strings(row.attributes, "attributes"),
      prerequisites: prerequisite(row.prerequisites), sessions, campus: typeof row.campus === "string" ? row.campus : "",
      details_url: detailsURL, source_updated_at: timestamp(row.lastUpdate),
      restrictions: row.restrictions ?? null };
    if (section.prerequisites && section.prerequisites.length > 10000) throw new Error("Resis prerequisite text is too long.");
    const code = `${subject} ${num}`;
    const list = groups.get(code) ?? [];
    list.push(section);
    groups.set(code, list);
  }
  const courses = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([code, sections]) => ({
    code, title: sections[0].title, credits: Math.max(...sections.map((s) => s.credits)),
    instructors: unique(sections.flatMap((s) => s.instructors)),
    attributes: unique(sections.flatMap((s) => s.attributes)),
    prerequisite_variants: unique(sections.flatMap((s) => s.prerequisites ? [s.prerequisites] : [])),
    sections, source_updated_at: sections.map((s) => s.source_updated_at).filter(Boolean).sort().at(-1) ?? null,
  }));
  const hash = createHash("sha256").update(JSON.stringify({ semester, fetchedAt: envelope.fetchedAt, courses })).digest("hex");
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  return { id, semester, fetched_at: new Date(envelope.fetchedAt).toISOString(), courses, section_count: entries.length };
}

function check(result, stage) {
  if (result.error) throw new Error(`Resis import stopped at ${stage} (database code: ${result.error.code ?? "unknown"}). The prior semester snapshot remains active.`);
  return result.data;
}
export async function importResisSnapshot(client, snapshot) {
  const current = check(await client.from("resis_semesters").select("active_import_id").eq("id", snapshot.semester.id).maybeSingle(), "snapshot lookup");
  if (current?.active_import_id === snapshot.id) return { unchanged: true, courses: snapshot.courses.length };
  check(await client.from("resis_semesters").upsert(snapshot.semester, { onConflict: "id" }), "semester metadata");
  const created = await client.from("resis_imports").insert({ id: snapshot.id, semester_id: snapshot.semester.id,
    fetched_at: snapshot.fetched_at, expected_courses: snapshot.courses.length });
  if (created.error?.code !== "23505") check(created, "snapshot creation");
  for (let start = 0; start < snapshot.courses.length; start += 40) {
    check(await client.rpc("stage_resis_courses", { p_import_id: snapshot.id, p_courses: snapshot.courses.slice(start, start + 40) }), "course staging");
  }
  check(await client.rpc("activate_resis_import", { p_import_id: snapshot.id }), "snapshot activation");
  return { unchanged: false, courses: snapshot.courses.length };
}
