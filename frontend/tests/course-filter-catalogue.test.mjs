import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const directory = new URL("../../supabase/migrations/", import.meta.url);
const files = await readdir(directory);
const migration = async (suffix) => {
  const matches = files.filter((file) => file.endsWith(suffix));
  assert.equal(matches.length, 1);
  return readFile(new URL(matches[0], directory), "utf8");
};
const migrations = await Promise.all([
  "_create_courses.sql", "_create_course_reviews.sql", "_create_course_rating_averages.sql", "_create_course_filter_catalogue.sql",
].map(migration));
const users = [1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const courses = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
const denied = (error) => error.code === "42501";

describe("SCRUM-173 course filter catalogue", () => {
  let database;
  before(async () => {
    database = new PGlite();
    await database.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `);
    for (const sql of migrations) await database.exec(sql);
  });
  after(async () => { await database?.close(); });
  beforeEach(async () => {
    await database.exec("truncate public.courses cascade; truncate auth.users cascade");
    for (const user of users) await database.query("insert into auth.users(id) values ($1)", [user]);
    for (const [index, id] of courses.entries()) await database.query(`
      insert into public.courses(id, code, name, description, credits, department)
      values ($1, $2, $3, 'Synthetic filter course.', $4, $5)
    `, [id, `DEMO ${index + 1}01`, `Course ${index + 1}`, [3, 0, 3.25, 4][index], index === 2 ? "Arts" : "Computing"]);
  });
  async function asRole(role, operation, userId = users[0]) {
    assert.ok(["anon", "authenticated", "service_role"].includes(role));
    await database.exec(`set role ${role}`);
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    try { return await operation(); }
    finally { await database.exec("reset role; reset request.jwt.claim.sub"); }
  }
  async function review(courseId, userId, difficulty, workload) {
    return (await database.query(`insert into public.course_reviews(course_id, student_id,
      difficulty_rating, workload_rating, usefulness_rating, overall_rating, body, semester_taken, completed_course)
      values ($1, $2, $3, $4, 4, 5, 'Synthetic review.', 'Fall 2026', true) returning id`,
    [courseId, userId, difficulty, workload])).rows[0].id;
  }
  async function threeReviews(courseId = courses[3]) {
    const ids = [];
    for (const [index, user] of users.entries()) ids.push(await review(courseId, user, [2, 3, 5][index], [3, 4, 1][index]));
    return ids;
  }
  const find = async (id = courses[3]) => (await database.query("select * from public.course_filter_catalogue where id = $1", [id])).rows[0];

  it("retains unrated courses with NULL difficulty and workload", async () => {
    await asRole("authenticated", async () => {
      const { rows } = await database.query("select * from public.course_filter_catalogue");
      assert.equal(rows.length, 4);
      for (const row of rows) {
        assert.equal(Number(row.review_count), 0);
        assert.equal(row.difficulty, null); assert.equal(row.workload, null);
      }
    });
  });
  it("does not match rating predicates below the three-review threshold", async () => {
    await review(courses[0], users[0], 1, 1);
    await review(courses[0], users[1], 1, 1);
    await asRole("authenticated", async () => {
      assert.equal(Number((await find(courses[0])).review_count), 2);
      assert.equal((await database.query("select id from public.course_filter_catalogue where difficulty <= 5 or workload >= 1")).rows.length, 0);
    });
  });
  it("uses the same one-decimal averages as the displayed summary at three reviews", async () => {
    await threeReviews();
    await asRole("authenticated", async () => {
      const row = await find();
      assert.equal(Number(row.review_count), 3);
      assert.equal(Number(row.difficulty), 3.3);
      assert.equal(Number(row.workload), 2.7);
    });
  });
  it("includes rounded boundary values while the original averages keep full precision", async () => {
    await threeReviews();
    const row = (await database.query("select average_difficulty from public.course_rating_averages where course_id = $1", [courses[3]])).rows[0];
    assert.ok(Number(row.average_difficulty) > 3.3);
    await asRole("authenticated", async () => {
      const { rows } = await database.query("select id from public.course_filter_catalogue where difficulty >= 3.3 and difficulty <= 3.3");
      assert.deepEqual(rows.map((row) => row.id), [courses[3]]);
    });
  });
  it("supports zero and fractional credits independently of review availability", async () => {
    await asRole("authenticated", async () => {
      assert.deepEqual((await database.query("select id from public.course_filter_catalogue where credits >= 0 and credits <= 0")).rows.map((row) => row.id), [courses[1]]);
      assert.deepEqual((await database.query("select id from public.course_filter_catalogue where credits >= 3.25 and credits <= 3.25")).rows.map((row) => row.id), [courses[2]]);
    });
  });
  it("combines text, department, credits and both rating dimensions in SQL", async () => {
    await threeReviews();
    await threeReviews(courses[2]);
    await asRole("authenticated", async () => {
      const { rows } = await database.query(`select id from public.course_filter_catalogue
        where (code ilike '%DEMO%' or name ilike '%DEMO%') and department = 'Computing'
          and credits >= 3 and credits <= 4 and difficulty >= 3 and difficulty <= 3.3
          and workload >= 2 and workload <= 3 order by code limit 24 offset 0`);
      assert.deepEqual(rows.map((row) => row.id), [courses[3]]);
    });
  });
  it("updates rating filters immediately after owner edits and deletion", async () => {
    const ids = await threeReviews();
    await asRole("authenticated", async () => {
      await database.query("update public.course_reviews set difficulty_rating = 5, workload_rating = 1 where id = $1", [ids[0]]);
      assert.equal(Number((await find()).difficulty), 4.3);
      assert.equal(Number((await find()).workload), 2);
      await database.query("delete from public.course_reviews where id = $1", [ids[0]]);
      assert.equal((await find()).difficulty, null);
      assert.equal((await find()).workload, null);
    });
  });
  it("honors underlying review RLS through both invoker views", async () => {
    await threeReviews();
    await database.exec(`alter policy "Signed-in students can read course reviews" on public.course_reviews using (student_id = (select auth.uid()))`);
    try {
      await asRole("authenticated", async () => {
        const row = await find();
        assert.equal(Number(row.review_count), 1);
        assert.equal(row.difficulty, null);
      });
    } finally {
      await database.exec(`alter policy "Signed-in students can read course reviews" on public.course_reviews using (true)`);
    }
  });
  it("does not expose a course hidden by the catalogue RLS policy", async () => {
    await threeReviews();
    await database.exec(`alter policy "Signed-in students can read the course catalogue" on public.courses using (code = 'DEMO 101')`);
    try { await asRole("authenticated", async () => assert.equal(await find(), undefined)); }
    finally { await database.exec(`alter policy "Signed-in students can read the course catalogue" on public.courses using (true)`); }
  });
  it("uses invoker security with SELECT-only grants despite broad Supabase defaults", async () => {
    const row = (await database.query("select reloptions from pg_class where oid = 'public.course_filter_catalogue'::regclass")).rows[0];
    assert.ok(row.reloptions.includes("security_invoker=true"));
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows: [grants] } = await database.query(`select
        has_table_privilege($1, 'public.course_filter_catalogue', 'select') as can_read,
        has_table_privilege($1, 'public.course_filter_catalogue', 'insert,update,delete,truncate,references,trigger') as can_write`, [role]);
      assert.equal(grants.can_read, role !== "anon"); assert.equal(grants.can_write, false);
    }
    await asRole("anon", () => assert.rejects(database.query("select * from public.course_filter_catalogue"), denied));
  });
  it("exposes no student identities, review bodies or account metadata", async () => {
    const row = await find();
    assert.deepEqual(Object.keys(row), ["id", "code", "name", "credits", "description", "department", "review_count", "difficulty", "workload"]);
  });
  it("allows trusted server maintenance to read without a student session", async () => {
    await threeReviews();
    await asRole("service_role", async () => assert.equal(Number((await find()).difficulty), 3.3), "");
  });
  it("requires access to the underlying aggregate view", async () => {
    await database.exec("revoke select on public.course_rating_averages from authenticated");
    try { await asRole("authenticated", () => assert.rejects(find(), denied)); }
    finally { await database.exec("grant select on public.course_rating_averages to authenticated"); }
  });
});
