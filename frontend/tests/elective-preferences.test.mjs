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
  it("denies cross-user reads, updates, deletes, inserts and owner reassignment", async () => {
    await asUser(OTHER, async () => {
      assert.equal((await db.query("select * from public.elective_preferences")).rows.length, 0);
      assert.equal((await db.query("update public.elective_preferences set academic_goals = 'Tampered' returning *")).rows.length, 0);
      assert.equal((await db.query("delete from public.elective_preferences returning *")).rows.length, 0);
      await assert.rejects(db.query("insert into public.elective_preferences(student_id,interests,preferred_workload,academic_goals) values ($1, '{art}', 'light', 'Tampered')", [OWNER]), e => e.code === "42501");
    });
    await asUser(OWNER, () => assert.rejects(db.query("update public.elective_preferences set student_id=$1", [OTHER]), e => e.code === "42501"));
  });
  it("updates and reloads Unicode preferences without creating another owner's row", async () => {
    await asUser(OWNER, async () => {
      await db.query("update public.elective_preferences set interests=$1, academic_goals=$2, preferred_workload='heavy'", [["تعلم الآلة", "فن"], "تعلم تصميم الروبوتات"]);
      const { rows } = await db.query("select student_id, interests, academic_goals, preferred_workload from public.elective_preferences");
      assert.deepEqual(rows, [{ student_id: OWNER, interests: ["تعلم الآلة", "فن"], academic_goals: "تعلم تصميم الروبوتات", preferred_workload: "heavy" }]);
    });
    await asUser(OTHER, async () => assert.equal((await db.query("select * from public.elective_preferences")).rows.length, 0));
  });
  it("rejects unknown catalogue codes and invalid direct database inputs", async () => {
    await asUser(OWNER, async () => {
      for (const sql of ["update public.elective_preferences set completed_course_codes='{FAKE 999}'", "update public.elective_preferences set interests='{NULL}'", "update public.elective_preferences set interests='{}'", "update public.elective_preferences set preferred_workload='invalid'"]) {
        await assert.rejects(db.query(sql), e => e.code === "23514");
      }
    });
  });
  it("enforces input bounds and control-character checks on direct writes", async () => {
    const cases = [
      ["interests", [" "]],
      ["interests", ["x".repeat(61)]],
      ["interests", Array(11).fill("art")],
      ["interests", ["art\nrobotics"]],
      ["academic_goals", " "],
      ["academic_goals", "x".repeat(1001)],
      ["academic_goals", "learn\nrobotics"],
      ["completed_course_codes", Array(61).fill("CMPS 101")],
      ["completed_course_codes", [null]],
    ];
    await asUser(OWNER, async () => {
      for (const [column, value] of cases) {
        await assert.rejects(db.query(`update public.elective_preferences set ${column}=$1`, [value]), e => e.code === "23514");
      }
      assert.equal((await db.query("select academic_goals from public.elective_preferences")).rows[0].academic_goals, "تعلم تصميم الروبوتات");
    });
  });
  it("grants no anonymous access", async () => {
    await db.exec("set role anon");
    try {
      for (const sql of ["select * from public.elective_preferences", "update public.elective_preferences set academic_goals='Tampered'", "delete from public.elective_preferences", "truncate public.elective_preferences"]) {
        await assert.rejects(db.query(sql), e => e.code === "42501");
      }
      await assert.rejects(db.query("insert into public.elective_preferences(student_id,interests,preferred_workload,academic_goals) values ($1,'{art}','light','Tampered')", [OTHER]), e => e.code === "42501");
    } finally { await db.exec("reset role"); }
  });
});
