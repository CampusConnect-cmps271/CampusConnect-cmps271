import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const readMigration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const coursesMigration = await readMigration("20261017091812_create_courses.sql");
const reviewsMigration = await readMigration("20261018191925_create_course_reviews.sql");
const verification = await readFile(new URL("../../supabase/queries/verify-course-reviews.sql", import.meta.url), "utf8");
const student = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const missing = "00000000-0000-4000-8000-000000000099";
const course = "10000000-0000-4000-8000-000000000001";
const secondCourse = "10000000-0000-4000-8000-000000000002";
const ratings = ["difficulty_rating", "workload_rating", "usefulness_rating", "overall_rating"];

describe("SCRUM-169 course review data and permissions", () => {
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
      -- Reproduce Supabase's broad defaults so the migration must revoke them.
      alter default privileges in schema public
        grant all on tables to anon, authenticated, service_role;
    `);
    await database.exec(coursesMigration);
    await database.exec(reviewsMigration);
  });
  after(async () => { await database?.close(); });
  beforeEach(async () => {
    await database.exec("truncate public.course_reviews");
    await database.query("insert into auth.users(id) values ($1), ($2) on conflict do nothing", [student, other]);
    await database.query(`insert into public.courses(id, code, name, description, credits, department)
      values ($1, 'DEMO 101', 'First course', 'Synthetic first course.', 3, 'Test department'),
             ($2, 'DEMO 201', 'Second course', 'Synthetic second course.', 3, 'Test department')
      on conflict do nothing`, [course, secondCourse]);
  });

  async function asRole(role, userId, operation) {
    assert.ok(["anon", "authenticated", "service_role"].includes(role));
    await database.exec(`set role ${role}`);
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    try { return await operation(); }
    finally { await database.exec("reset role; reset request.jwt.claim.sub"); }
  }
  const asStudent = (operation, id = student) => asRole("authenticated", id, operation);

  async function insert(overrides = {}) {
    const values = {
      course_id: course, student_id: student, difficulty_rating: 2, workload_rating: 3,
      usefulness_rating: 5, overall_rating: 4, body: "Useful examples.\n\nThe project helped.",
      semester_taken: "Fall 2026", completed_course: true, ...overrides,
    };
    const fields = Object.keys(values).filter((key) => values[key] !== undefined);
    const result = await database.query(`insert into public.course_reviews (${fields.join(",")})
      values (${fields.map((_, index) => `$${index + 1}`).join(",")}) returning *`, fields.map((field) => values[field]));
    return result.rows[0];
  }
  const sqlError = (code) => (error) => error.code === code;

  it("enables RLS and allows a student to create and read their review", async () => {
    const { rows: [table] } = await database.query("select relrowsecurity from pg_class where oid = 'public.course_reviews'::regclass");
    assert.equal(table.relrowsecurity, true);
    await asStudent(async () => {
      const row = await insert({ student_id: undefined });
      assert.equal(row.student_id, student);
      assert.equal(row.body, "Useful examples.\n\nThe project helped.");
      assert.equal(row.semester_taken, "Fall 2026");
      assert.equal(row.completed_course, true);
      assert.deepEqual(ratings.map((field) => Number(row[field])), [2, 3, 5, 4]);
      assert.ok(row.id && row.created_at && row.updated_at);
    });
  });

  it("lets another signed-in student read a review", async () => {
    await asStudent(() => insert());
    await asStudent(async () => {
      const { rows } = await database.query("select * from public.course_reviews where course_id = $1", [course]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].student_id, student);
    }, other);
  });

  it("allows only one review per student per course, even on a different semester", async () => {
    await asStudent(async () => {
      await insert();
      await assert.rejects(insert({ semester_taken: "Spring 2027" }), (error) =>
        error.code === "23505" && error.constraint === "course_reviews_one_per_student");
    });
  });

  it("allows different students on the same course and the same student on different courses", async () => {
    await asStudent(() => insert());
    await asStudent(() => insert({ student_id: other }), other);
    await asStudent(() => insert({ course_id: secondCourse }));
    const { rows } = await database.query("select count(*)::int as count from public.course_reviews");
    assert.equal(rows[0].count, 3);
  });

  it("prevents creating a review as another student", async () => {
    await asStudent(() => assert.rejects(insert({ student_id: other }), sqlError("42501")));
  });

  it("prevents an authenticated role with no user id from writing as a student", async () => {
    await asRole("authenticated", null, () => assert.rejects(insert(), sqlError("42501")));
  });

  it("lets the owner edit review content while the server updates the timestamp", async () => {
    const past = "2001-01-01T00:00:00Z";
    const row = await insert({ created_at: past, updated_at: past });
    await asStudent(async () => {
      const { rows: [updated] } = await database.query(`update public.course_reviews
        set body = $1, difficulty_rating = 5, semester_taken = 'Spring 2027'
        where id = $2 returning *`, ["Updated review.", row.id]);
      assert.equal(updated.body, "Updated review.");
      assert.equal(Number(updated.difficulty_rating), 5);
      assert.equal(updated.semester_taken, "Spring 2027");
      assert.equal(new Date(updated.created_at).toISOString(), new Date(past).toISOString());
      assert.ok(new Date(updated.updated_at) > new Date(past));
    });
  });

  it("leaves another student's review unchanged on UPDATE or DELETE", async () => {
    const row = await asStudent(() => insert());
    await asStudent(async () => {
      const update = await database.query("update public.course_reviews set body = 'Not mine' where id = $1 returning id", [row.id]);
      const deletion = await database.query("delete from public.course_reviews where id = $1 returning id", [row.id]);
      assert.equal(update.rows.length, 0);
      assert.equal(deletion.rows.length, 0);
    }, other);
    const { rows } = await database.query("select body from public.course_reviews where id = $1", [row.id]);
    assert.equal(rows[0].body, row.body);
  });

  it("blocks reassignment of ownership, course, id and timestamps", async () => {
    const row = await asStudent(() => insert());
    await asStudent(async () => {
      for (const [column, value] of [["student_id", other], ["course_id", secondCourse], ["id", missing],
        ["created_at", "2001-01-01"], ["updated_at", "2001-01-01"]]) {
        await assert.rejects(database.query(`update public.course_reviews set ${column} = $1 where id = $2`, [value, row.id]), sqlError("42501"));
      }
    });
  });

  it("retains the RLS ownership check even if a future grant permits editing student_id", async () => {
    const row = await asStudent(() => insert());
    await database.exec("grant update(student_id) on public.course_reviews to authenticated");
    try {
      await asStudent(() => assert.rejects(database.query("update public.course_reviews set student_id = $1 where id = $2", [other, row.id]), sqlError("42501")));
    } finally {
      await database.exec("revoke update(student_id) on public.course_reviews from authenticated");
    }
  });

  it("blocks client-supplied ids and timestamps during INSERT", async () => {
    await asStudent(async () => {
      for (const override of [{ id: missing }, { created_at: "2001-01-01" }, { updated_at: "2001-01-01" }]) {
        await assert.rejects(insert(override), sqlError("42501"));
      }
    });
  });

  it("allows all whole-number ratings from one through five", async () => {
    for (const value of [1, 2, 3, 4, 5]) {
      await database.exec("truncate public.course_reviews");
      await asStudent(async () => {
        const row = await insert(Object.fromEntries(ratings.map((column) => [column, value])));
        assert.deepEqual(ratings.map((column) => Number(row[column])), [value, value, value, value]);
      });
    }
  });

  for (const column of ratings) {
    it(`rejects out-of-range, fractional and special ${column} values without rounding`, async () => {
      await asStudent(async () => {
        for (const value of [0, 6, -1, 2.5, "NaN", "Infinity", "-Infinity"]) {
          await assert.rejects(insert({ [column]: value }), sqlError("23514"));
        }
        await assert.rejects(insert({ [column]: null }), sqlError("23502"));
      });
    });
  }

  it("rejects blank and oversized written reviews while preserving valid paragraph breaks", async () => {
    await asStudent(async () => {
      for (const body of ["", " \n\t\r ", "a".repeat(5001)]) {
        await assert.rejects(insert({ body }), sqlError("23514"));
      }
      const row = await insert({ body: "a".repeat(5000) });
      assert.equal(row.body.length, 5000);
    });
  });

  it("requires a nonblank semester of at most 80 characters", async () => {
    await asStudent(async () => {
      for (const semester_taken of ["", " \t\n ", "a".repeat(81)]) {
        await assert.rejects(insert({ semester_taken }), sqlError("23514"));
      }
      await assert.rejects(insert({ semester_taken: null }), sqlError("23502"));
    });
  });

  it("requires explicit confirmation of course completion", async () => {
    await asStudent(async () => {
      for (const completed_course of [false, undefined]) {
        await assert.rejects(insert({ completed_course }), sqlError("23514"));
      }
      await assert.rejects(insert({ completed_course: null }), sqlError("23502"));
    });
  });

  it("rejects nonexistent course and student references", async () => {
    await asStudent(() => assert.rejects(insert({ course_id: missing }), sqlError("23503")));
    await assert.rejects(insert({ student_id: missing }), sqlError("23503"));
  });

  it("lets the owner delete and later submit a new review", async () => {
    await asStudent(async () => {
      const original = await insert();
      const { rows } = await database.query("delete from public.course_reviews where id = $1 returning id", [original.id]);
      assert.equal(rows.length, 1);
      const replacement = await insert();
      assert.notEqual(replacement.id, original.id);
    });
  });

  it("blocks anonymous reads, writes, deletes and truncation despite broad default grants", async () => {
    await insert();
    await asRole("anon", null, async () => {
      for (const query of ["select * from public.course_reviews", "update public.course_reviews set body = 'Changed'",
        "delete from public.course_reviews", "truncate public.course_reviews"]) {
        await assert.rejects(database.query(query), sqlError("42501"));
      }
      await assert.rejects(insert(), sqlError("42501"));
    });
    await asStudent(() => assert.rejects(database.query("truncate public.course_reviews"), sqlError("42501")));
  });

  it("allows trusted service-role maintenance without relying on a student session", async () => {
    await asRole("service_role", null, async () => {
      const row = await insert({ student_id: other });
      await database.query("update public.course_reviews set body = 'Maintained' where id = $1", [row.id]);
      const result = await database.query("delete from public.course_reviews where id = $1 returning id", [row.id]);
      assert.equal(result.rows.length, 1);
    });
  });

  it("cleans up reviews when the referenced student or course is removed", async () => {
    await insert();
    await database.query("delete from auth.users where id = $1", [student]);
    assert.equal((await database.query("select * from public.course_reviews")).rows.length, 0);
    await insert({ student_id: other });
    await database.query("delete from public.courses where id = $1", [course]);
    assert.equal((await database.query("select * from public.course_reviews")).rows.length, 0);
  });

  it("keeps the timestamp trigger unprivileged and unavailable as a client RPC", async () => {
    const { rows: [fn] } = await database.query(`select prosecdef, proconfig,
      has_function_privilege('anon', oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', oid, 'execute') as student_execute
      from pg_proc where oid = 'public.set_course_review_updated_at()'::regprocedure`);
    assert.equal(fn.prosecdef, false);
    assert.equal(fn.anon_execute, false);
    assert.equal(fn.student_execute, false);
    assert.ok(fn.proconfig.some((value) => value.startsWith("search_path=")));
  });

  it("passes the hosted verification script and rolls all of its test writes back", async () => {
    try {
      const results = await database.exec(verification);
      assert.match(results.at(-1).rows[0].verification, /^PASS:/);
      assert.equal((await database.query("select count(*)::int as count from public.course_reviews")).rows[0].count, 0);
    } finally {
      await database.exec("rollback");
    }
  });
});
