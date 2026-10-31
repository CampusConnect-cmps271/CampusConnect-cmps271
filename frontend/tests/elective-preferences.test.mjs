import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "00000000-0000-4000-8000-000000000301";
const OTHER = "00000000-0000-4000-8000-000000000302";
describe("elective preferences migration and RLS", () => {
  let db;
  before(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${OWNER}'),('${OTHER}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;`);
    for (const name of ["20261017091812_create_courses.sql", "20261028094821_elective_preferences.sql"]) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    await db.exec("insert into public.courses(code,name,description,credits,department) values ('CMPS 101','Computing','Introduction',3,'CMPS')");
  });
  after(async () => db?.close());
  async function asUser(id, fn) {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`);
    try { return await fn(); } finally { await db.exec("reset role"); }
  }
  it("saves and reloads an owner's preferences", async () => {
    await asUser(OWNER, async () => {
      await db.query("insert into public.elective_preferences(student_id,interests,preferred_workload,academic_goals,completed_course_codes) values ($1, $2, 'light', 'Learn computing', $3)", [OWNER, ["فن"], ["CMPS 101"]]);
      assert.equal((await db.query("select * from public.elective_preferences")).rows[0].student_id, OWNER);
    });
  });
  it("denies cross-user reads, inserts and owner reassignment", async () => {
    await asUser(OTHER, async () => {
      assert.equal((await db.query("select * from public.elective_preferences")).rows.length, 0);
      assert.equal((await db.query("update public.elective_preferences set academic_goals = 'Tampered' returning *")).rows.length, 0);
      await assert.rejects(db.query("insert into public.elective_preferences(student_id,interests,preferred_workload,academic_goals) values ($1, '{art}', 'light', 'Tampered')", [OWNER]), e => e.code === "42501");
    });
    await asUser(OWNER, () => assert.rejects(db.query("update public.elective_preferences set student_id=$1", [OTHER]), e => e.code === "42501"));
  });
  it("rejects unknown catalogue codes and invalid direct database inputs", async () => {
    await asUser(OWNER, async () => {
      for (const sql of ["update public.elective_preferences set completed_course_codes='{FAKE 999}'", "update public.elective_preferences set interests='{NULL}'", "update public.elective_preferences set interests='{}'", "update public.elective_preferences set preferred_workload='invalid'"]) {
        await assert.rejects(db.query(sql), e => e.code === "23514");
      }
    });
  });
  it("grants no anonymous access", async () => {
    await db.exec("set role anon");
    try { await assert.rejects(db.query("select * from public.elective_preferences"), e => e.code === "42501"); } finally { await db.exec("reset role"); }
  });
});
