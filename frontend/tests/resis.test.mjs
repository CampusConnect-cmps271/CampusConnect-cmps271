import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { queryResis } from "../scripts/lib/resis-client.mjs";
import { buildResisSnapshot, parseResisSemesters } from "../scripts/lib/resis-catalogue.mjs";

const semester = [{ id: "202720", name: "Spring 2026-2027", source_updated_at: "2026-11-08T00:00:00Z" }];
function fixture() {
  return { uniId: "1", method: "getSemester", semesterId: "202720", fetchedAt: Date.parse("2026-11-08T01:00:00Z"), data: {
    "20904": { title: "Software Engineering", crn: "20904", subject: "CMPS", num: "271", section: "1", credits: "3",
      mainProf: "Test Instructor", attributes: ["Writing in the Discipline"],
      prerequisites: "CMPS 202 or CMPS 212 or EECE 330", lastUpdate: "2026-11-07T00:00:00Z",
      sessions: [{ days: "MW", start: "14:00", end: "15:15", instructor: "Test Instructor (P)", type: "Lecture", location: "Test Hall" }] },
    "20905": { title: "Software Engineering", crn: "20905", subject: "CMPS", num: "271", section: "2", credits: "3", sessions: [], prerequisites: [] },
    "20906": { title: "New course", crn: "20906", subject: "CMPS", num: "299L", section: "1", credits: "0", sessions: [],
      prerequisites: { prerequisites: [], "Prequisites for registration": [] } },
  }};
}

describe("Resis quota protection (all HTTP mocked)", () => {
  let directory;
  before(async () => { directory = await mkdtemp(join(tmpdir(), "resis-")); });
  after(async () => { await rm(directory, { recursive: true, force: true }); });
  const current = Date.parse("2026-11-08T00:00:00Z");
  function options(name, extras = {}) { return { cacheDir: join(directory, name), key: "secret-test-key", method: "listSemesters", now: () => current, ...extras }; }
  it("caches responses, sends the exact AUB request and never retries", async () => {
    let calls = 0;
    const opts = options("cache", { fetchImpl: async (url, init) => {
      calls++; assert.equal(url, "https://resis.org/api/"); assert.equal(init.redirect, "error");
      assert.equal(init.headers["X-API-Key"], "secret-test-key");
      assert.deepEqual(JSON.parse(init.body), { method: "listSemesters", uniId: "1" });
      return new Response(JSON.stringify([{ semesterID: 202720 }]));
    }});
    assert.equal((await queryResis(opts)).cached, false);
    assert.equal((await queryResis(opts)).cached, true);
    assert.equal(calls, 1);
    assert.ok(!(await readFile(join(opts.cacheDir, "usage.json"), "utf8")).includes("secret-test-key"));
    assert.ok(!(await readFile(join(opts.cacheDir, "semesters.json"), "utf8")).includes("secret-test-key"));
  });
  it("counts failed attempts and blocks rapid repeated calls", async () => {
    let calls = 0;
    const opts = options("fail", { fetchImpl: async () => { calls++; throw new Error("private-provider-message"); } });
    await assert.rejects(queryResis(opts), /no automatic retry/);
    await assert.rejects(queryResis(opts), /21 seconds/);
    await assert.rejects(queryResis({ ...opts, now: () => current + 22000 }), /already attempted/);
    assert.equal(calls, 1);
  });
  it("blocks another semester until the global 21-second interval passes", async () => {
    let calls = 0;
    const opts = options("spacing", { fetchImpl: async () => { calls++; return new Response("{}"); } });
    await queryResis(opts);
    await assert.rejects(queryResis({ ...opts, method: "getSemester", semesterId: "202720" }), /21 seconds/);
    await queryResis({ ...opts, method: "getSemester", semesterId: "202720", now: () => current + 22000 });
    assert.equal(calls, 2);
  });
  it("stops at the 40-attempt rolling budget well below the provider's 500", async () => {
    const opts = options("budget", { fetchImpl: async () => { throw new Error("MUST NOT CALL"); } });
    // Create directory through the no-key validation path independently.
    const { mkdir } = await import("node:fs/promises"); await mkdir(opts.cacheDir);
    await writeFile(join(opts.cacheDir, "usage.json"), JSON.stringify({ attempts: Array.from({ length: 40 }, (_, i) => ({ id: `other:${i}`, at: current - 60000 - i * 22000 })), blockedUntil: 0 }));
    await assert.rejects(queryResis(opts), /safety budget reached/);
  });
  it("honors 429 with a full-day cooldown, without retrying", async () => {
    let calls = 0;
    const opts = options("limited", { fetchImpl: async () => { calls++; return new Response("{}", { status: 429, headers: { "retry-after": "60" } }); } });
    await assert.rejects(queryResis(opts), /HTTP 429/);
    await assert.rejects(queryResis({ ...opts, now: () => current + 3600000 }), /cooling down/);
    assert.equal(calls, 1);
  });
  it("serializes simultaneous processes through an exclusive cache lock", async () => {
    let release;
    let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    const blocked = new Promise((resolve) => { release = resolve; });
    const opts = options("lock", { fetchImpl: async () => { entered(); await blocked; return new Response("[]"); } });
    const first = queryResis(opts);
    await started;
    await assert.rejects(queryResis(opts), /holds the cache lock/);
    release(); await first;
  });
});

describe("Resis verified response mapping", () => {
  it("groups sections by course, preserves OR rules and keeps missing requirements unknown", () => {
    const snapshot = buildResisSnapshot(fixture(), semester);
    assert.equal(snapshot.courses.length, 2); assert.equal(snapshot.section_count, 3);
    const course = snapshot.courses[0];
    assert.equal(course.code, "CMPS 271");
    assert.deepEqual(course.prerequisite_variants, ["CMPS 202 or CMPS 212 or EECE 330"]);
    assert.deepEqual(course.instructors, ["Test Instructor"]);
    assert.equal(course.sections[1].prerequisites, null);
    assert.equal(snapshot.courses[1].credits, 0);
    assert.equal(buildResisSnapshot(fixture(), semester).id, snapshot.id);
  });
  it("rejects an unrecognized nonempty prerequisite expression instead of inventing meaning", () => {
    const input = fixture(); input.data["20904"].prerequisites = { or: ["CMPS 202", "EECE 330"] };
    assert.throws(() => buildResisSnapshot(input, semester), /Unrecognized Resis prerequisite/);
  });
  it("rejects wrong universities, semesters, CRNs and invalid credits before any import", () => {
    for (const mutate of [r => { r.uniId = "2"; }, r => { r.semesterId = "202710"; }, r => { r.data["20904"].crn = "1"; }, r => { r.data["20904"].credits = "NaN"; }]) {
      const input = fixture(); mutate(input); assert.throws(() => buildResisSnapshot(input, semester));
    }
    assert.deepEqual(parseResisSemesters([{ semesterID: 202720, semesterName: "Spring 2026-2027", lastUpdate: "2026-11-08T00:00:00Z" }])[0].id, "202720");
  });
});

describe("Resis semester import permissions and atomic publication", () => {
  let db;
  const id = "10000000-0000-4000-a000-000000000001";
  const second = "10000000-0000-4000-a000-000000000002";
  before(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
    await db.exec(await readFile(new URL("../../supabase/migrations/20261017091812_create_courses.sql", import.meta.url), "utf8"));
    await db.exec(`create view public.course_rating_averages with (security_invoker=true) as
      select id as course_id,0::bigint as review_count,null::numeric as average_difficulty,null::numeric as average_workload from public.courses;
      grant select on public.course_rating_averages to authenticated,service_role;`);
    await db.exec(await readFile(new URL("../../supabase/migrations/20261108193027_resis_semester_catalogue.sql", import.meta.url), "utf8"));
    await db.exec(`insert into public.courses(code,name,description,credits,department,prerequisites)
      values ('CMPS 271','Complete course name','Rich AUB catalogue description',3,'Computer Science','Minimum C+ in CMPS 202 or EECE 330');`);
  });
  after(async () => { await db?.close(); });
  async function as(role, operation) {
    await db.exec(`set role ${role}`);
    try { return await operation(); } finally { await db.exec("reset role"); }
  }
  async function stage(batchId, courses) {
    return db.query("select public.stage_resis_courses($1,$2::jsonb)", [batchId, JSON.stringify(courses)]);
  }
  it("stages courses without exposing an incomplete semester, preserving existing catalogue facts and IDs", async () => {
    const original = (await db.query("select * from public.courses where code='CMPS 271'")).rows[0];
    await as("service_role", async () => {
      await db.query("insert into public.resis_semesters(id,name) values ($1,$2)", [semester[0].id, semester[0].name]);
      await db.query("insert into public.resis_imports(id,semester_id,fetched_at,expected_courses) values ($1,'202720','2026-11-08',2)", [id]);
      await stage(id, buildResisSnapshot(fixture(), semester).courses);
    });
    const after = (await db.query("select * from public.courses where code='CMPS 271'")).rows[0];
    assert.equal(after.id, original.id); assert.equal(after.prerequisites, original.prerequisites);
    assert.equal(after.description, original.description); assert.equal(after.name, original.name);
    const added = (await db.query("select * from public.courses where code='CMPS 299L'")).rows[0];
    assert.equal(added.data_source, "resis"); assert.equal(added.credits, "0.00");
    await as("authenticated", async () => assert.equal((await db.query("select * from public.course_semester_catalogue")).rows.length, 0));
  });
  it("publishes only a complete snapshot and exposes section instructors, attributes and rules", async () => {
    await as("service_role", () => db.query("select public.activate_resis_import($1)", [id]));
    await as("authenticated", async () => {
      const rows = (await db.query("select * from public.course_semester_catalogue order by code")).rows;
      assert.equal(rows.length, 2); assert.equal(rows[0].semester_id, "202720");
      assert.deepEqual(rows[0].instructors, ["Test Instructor"]);
      assert.deepEqual(rows[0].attributes, ["Writing in the Discipline"]);
      assert.equal(rows[0].sections[0].prerequisites, "CMPS 202 or CMPS 212 or EECE 330");
      assert.equal(rows[0].prerequisites, "Minimum C+ in CMPS 202 or EECE 330");
    });
    await as("service_role", () => assert.rejects(stage(id, buildResisSnapshot(fixture(), semester).courses), /immutable/));
  });
  it("keeps the old snapshot readable when the next import is incomplete", async () => {
    await as("service_role", async () => {
      await db.query("insert into public.resis_imports(id,semester_id,fetched_at,expected_courses) values ($1,'202720','2026-11-09',2)", [second]);
      await stage(second, buildResisSnapshot(fixture(), semester).courses.slice(0,1));
      await assert.rejects(db.query("select public.activate_resis_import($1)", [second]), /Incomplete/);
    });
    await as("authenticated", async () => {
      assert.equal((await db.query("select count(*)::int as n from public.course_offerings")).rows[0].n, 2);
      assert.equal((await db.query("select active_import_id from public.resis_semesters")).rows[0].active_import_id, id);
    });
  });
  it("replaces a semester atomically and prevents an older response overwriting it", async () => {
    await as("service_role", async () => {
      await stage(second, buildResisSnapshot(fixture(), semester).courses);
      await db.query("select public.activate_resis_import($1)", [second]);
      await assert.rejects(db.query("select public.activate_resis_import($1)", [id]), /newer snapshot/);
    });
    await as("authenticated", async () => assert.equal((await db.query("select count(*)::int as n from public.course_offerings")).rows[0].n, 2));
  });
  it("denies anonymous reads, all student writes and maintenance function execution", async () => {
    const denied = error => error.code === "42501";
    await as("anon", () => assert.rejects(db.query("select * from public.course_semester_catalogue"), denied));
    for (const role of ["anon", "authenticated"]) await as(role, async () => {
      await assert.rejects(db.query("select public.activate_resis_import($1)", [id]), denied);
      await assert.rejects(stage(id, buildResisSnapshot(fixture(), semester).courses), denied);
      await assert.rejects(db.query("update public.resis_semesters set synced_at = now()"), denied);
      await assert.rejects(db.query("select * from public.resis_imports"), denied);
    });
  });
});

it("preserves explicit connected CRNs without guessing component types",()=>{
 const envelope=fixture();envelope.data["20904"].connected=["20905"];
 const snapshot=buildResisSnapshot(envelope,semester);
 assert.deepEqual(snapshot.courses.find(c=>c.code==="CMPS 271").sections[0].connected_crns,["20905"]);
 envelope.data["20904"].connected=["not a CRN"];
 assert.throws(()=>buildResisSnapshot(envelope,semester),/Invalid connected CRN/);
});
