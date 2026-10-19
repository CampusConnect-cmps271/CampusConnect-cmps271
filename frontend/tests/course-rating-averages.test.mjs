import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const directory = new URL("../../supabase/migrations/", import.meta.url);
const readMigration = (name) => readFile(new URL(name, directory), "utf8");
const viewFiles = (await readdir(directory)).filter((name) => name.endsWith("_create_course_rating_averages.sql"));
assert.equal(viewFiles.length, 1, "Expected exactly one ratings view migration");
const migrations = await Promise.all([
  "20261017091812_create_courses.sql", "20261018191925_create_course_reviews.sql", viewFiles[0],
].map(readMigration));
const verification = await readFile(new URL("../../supabase/queries/verify-course-rating-averages.sql", import.meta.url), "utf8");
const users = [1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const courses = [1, 2].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
const columns = ["average_difficulty", "average_workload", "average_usefulness", "average_overall"];
const denied = (error) => error.code === "42501";

describe("SCRUM-171 live course rating averages", () => {
  let database;
  before(async () => {
    database = new PGlite();
    await database.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
      alter default privileges in schema public
        grant all on tables to anon, authenticated, service_role;
    `);
    for (const migration of migrations) await database.exec(migration);
  });
  after(async () => { await database?.close(); });
  beforeEach(async () => {
    await database.exec("truncate public.courses cascade; truncate auth.users cascade");
    for (const user of users) await database.query("insert into auth.users(id) values ($1)", [user]);
    for (const [index, id] of courses.entries()) await database.query(`
      insert into public.courses(id, code, name, description, credits, department)
      values ($1, $2, 'Test course', 'Synthetic course for average tests.', 3, 'Test department')
    `, [id, `DEMO ${index + 1}01`]);
  });

  async function asRole(role, operation, userId = users[0]) {
    assert.ok(["anon", "authenticated", "service_role"].includes(role));
    await database.exec(`set role ${role}`);
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    try { return await operation(); }
    finally { await database.exec("reset role; reset request.jwt.claim.sub"); }
  }
  async function review(userId = users[0], courseId = courses[0], ratings = [1, 2, 5, 4]) {
    const { rows: [row] } = await database.query(`
      insert into public.course_reviews(course_id, student_id, difficulty_rating,
        workload_rating, usefulness_rating, overall_rating, body, semester_taken, completed_course)
      values ($1, $2, $3, $4, $5, $6, 'Synthetic review.', 'Fall 2026', true) returning id
    `, [courseId, userId, ...ratings]);
    return row.id;
  }
  async function summary(courseId = courses[0]) {
    return (await database.query("select * from public.course_rating_averages where course_id = $1", [courseId])).rows[0];
  }
  function assertSummary(row, count, ratings) {
    assert.equal(Number(row.review_count), count);
    assert.deepEqual(columns.map((key) => row[key] === null ? null : Number(row[key])), ratings);
  }

  it("returns a zero count and NULL averages for every course without reviews", async () => {
    await asRole("authenticated", async () => {
      const { rows } = await database.query("select * from public.course_rating_averages");
      assert.equal(rows.length, 2);
      for (const row of rows) assertSummary(row, 0, [null, null, null, null]);
    });
  });

  it("updates all four averages immediately after an authenticated insert", async () => {
    await asRole("authenticated", async () => {
      await review();
      assertSummary(await summary(), 1, [1, 2, 5, 4]);
    });
  });

  it("averages distinct students independently for each course", async () => {
    await review();
    await review(users[1], courses[0], [4, 5, 2, 1]);
    await review(users[0], courses[1], [5, 4, 3, 2]);
    await asRole("authenticated", async () => {
      assertSummary(await summary(), 2, [2.5, 3.5, 3.5, 2.5]);
      assertSummary(await summary(courses[1]), 1, [5, 4, 3, 2]);
    });
  });

  it("keeps numeric precision and includes one and two review courses for the later UI threshold", async () => {
    for (const [index, user] of users.entries()) await review(user, courses[0], [index === 2 ? 2 : 1, 3, 4, 5]);
    await asRole("authenticated", async () => {
      const row = await summary();
      assert.equal(Number(row.review_count), 3);
      assert.ok(Math.abs(Number(row.average_difficulty) - 4 / 3) < 1e-12);
      assert.ok(Number(row.average_difficulty) > 1.33, "Must not round to a display precision");
    });
  });

  it("recalculates all dimensions on owner edits without increasing the count", async () => {
    const id = await review();
    await review(users[1], courses[0], [4, 5, 2, 1]);
    await asRole("authenticated", async () => {
      await database.query(`update public.course_reviews set difficulty_rating = 5,
        workload_rating = 1, usefulness_rating = 4, overall_rating = 3 where id = $1`, [id]);
      assertSummary(await summary(), 2, [4.5, 3, 3, 2]);
      await database.query("update public.course_reviews set body = 'New wording.' where id = $1", [id]);
      assertSummary(await summary(), 2, [4.5, 3, 3, 2]);
    });
  });

  it("updates on owner deletion and returns to NULL averages after the last review", async () => {
    const id = await review();
    await review(users[1], courses[0], [4, 5, 2, 1]);
    await asRole("authenticated", async () => {
      await database.query("delete from public.course_reviews where id = $1", [id]);
      assertSummary(await summary(), 1, [4, 5, 2, 1]);
    });
    await asRole("authenticated", async () => {
      await database.query("delete from public.course_reviews where course_id = $1", [courses[0]]);
      assertSummary(await summary(), 0, [null, null, null, null]);
    }, users[1]);
  });

  it("reflects cascaded user and course deletion", async () => {
    await review();
    await database.query("delete from auth.users where id = $1", [users[0]]);
    assertSummary(await summary(), 0, [null, null, null, null]);
    await database.query("delete from public.courses where id = $1", [courses[0]]);
    assert.equal(await summary(), undefined);
  });

  it("is an invoker view with only aggregate columns and explicit read-only grants", async () => {
    const { rows: [view] } = await database.query(`select relkind, reloptions from pg_class
      where oid = 'public.course_rating_averages'::regclass`);
    assert.equal(view.relkind, "v", "A regular view must not need a materialized refresh");
    assert.ok(view.reloptions.includes("security_invoker=true"));
    assert.deepEqual(Object.keys(await summary()), ["course_id", "review_count", ...columns]);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows: [privileges] } = await database.query(`select
        has_table_privilege($1, 'public.course_rating_averages', 'select') as can_read,
        has_table_privilege($1, 'public.course_rating_averages', 'insert,update,delete,truncate,references,trigger') as can_write`, [role]);
      assert.equal(privileges.can_read, role !== "anon");
      assert.equal(privileges.can_write, false);
    }
  });

  it("denies anonymous reads and student/service writes under broad default grants", async () => {
    await asRole("anon", () => assert.rejects(database.query("select * from public.course_rating_averages"), denied));
    for (const role of ["authenticated", "service_role"]) await asRole(role, async () => {
      for (const sql of [
        "insert into public.course_rating_averages(course_id, review_count) values ('10000000-0000-4000-8000-000000000001', 9)",
        "update public.course_rating_averages set review_count = 9",
        "delete from public.course_rating_averages",
      ]) await assert.rejects(database.query(sql), (error) => ["42501", "55000"].includes(error.code));
    });
  });

  it("lets trusted maintenance read the aggregate without a student session", async () => {
    await review();
    await asRole("service_role", async () => assertSummary(await summary(), 1, [1, 2, 5, 4]), "");
  });

  it("honors more restrictive future review SELECT policies instead of bypassing RLS", async () => {
    await review();
    await review(users[1], courses[0], [4, 5, 2, 1]);
    await database.exec(`alter policy "Signed-in students can read course reviews"
      on public.course_reviews using (student_id = (select auth.uid()))`);
    try {
      await asRole("authenticated", async () => assertSummary(await summary(), 1, [1, 2, 5, 4]));
      await asRole("authenticated", async () => assertSummary(await summary(), 1, [4, 5, 2, 1]), users[1]);
      await asRole("authenticated", async () => assertSummary(await summary(), 0, [null, null, null, null]), users[2]);
    } finally {
      await database.exec(`alter policy "Signed-in students can read course reviews" on public.course_reviews using (true)`);
    }
  });

  it("does not expose a course hidden by its underlying catalogue policy", async () => {
    await review();
    await database.exec(`alter policy "Signed-in students can read the course catalogue"
      on public.courses using (code = 'DEMO 201')`);
    try {
      await asRole("authenticated", async () => {
        assert.equal(await summary(), undefined);
        assertSummary(await summary(courses[1]), 0, [null, null, null, null]);
      });
    } finally {
      await database.exec(`alter policy "Signed-in students can read the course catalogue" on public.courses using (true)`);
    }
  });

  it("requires underlying table privileges even when SELECT on the view is granted", async () => {
    await database.exec("revoke select on public.course_reviews from authenticated");
    try {
      await asRole("authenticated", () => assert.rejects(summary(), denied));
    } finally {
      await database.exec("grant select on public.course_reviews to authenticated");
    }
  });

  it("passes the rollback-only hosted verification without leaving review data behind", async () => {
    try {
      const results = await database.exec(verification);
      assert.match(results.at(-1).rows[0].verification, /^PASS:/);
      assert.equal(Number((await database.query("select count(*) as count from public.course_reviews")).rows[0].count), 0);
    } finally {
      await database.exec("rollback");
    }
  });
});
