import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { parseCourseCatalogue } from "../scripts/import-courses.mjs";

const migration = await readFile(new URL("../../supabase/migrations/20261015090000_create_courses.sql", import.meta.url), "utf8");
const example = await readFile(new URL("../../supabase/data/courses.example.csv", import.meta.url), "utf8");

describe("SCRUM-166 course storage and permissions", () => {
  let database;
  before(async () => {
    database = new PGlite();
    await database.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public
        grant all on tables to anon, authenticated, service_role;
    `);
    await database.exec(migration);
  });
  after(async () => { await database?.close(); });

  async function asRole(role, operation) {
    assert.ok(["anon", "authenticated", "service_role"].includes(role));
    await database.exec(`set role ${role}`);
    try { return await operation(); }
    finally { await database.exec("reset role"); }
  }

  const upsert = (course) => database.query(`
    insert into public.courses (code, name, description, credits, prerequisites, department)
    values ($1, $2, $3, $4, $5, $6)
    on conflict (code) do update set
      name = excluded.name, description = excluded.description,
      credits = excluded.credits, prerequisites = excluded.prerequisites,
      department = excluded.department
    returning id, code, name, credits, prerequisites, created_at
  `, [course.code, course.name, course.description, course.credits, course.prerequisites, course.department]);

  it("imports parsed CSV rows under the service role", async () => {
    await asRole("service_role", async () => {
      for (const course of parseCourseCatalogue(example)) await upsert(course);
      const { rows } = await database.query("select code from public.courses order by code");
      assert.deepEqual(rows.map((row) => row.code), ["DEMO 101", "DEMO 201"]);
    });
  });

  it("reimports update metadata without duplicating courses or changing stable IDs", async () => {
    await asRole("service_role", async () => {
      const original = parseCourseCatalogue(example)[0];
      const { rows: [before] } = await upsert(original);
      const { rows: [after] } = await upsert({ ...original, name: "Updated title", credits: 3.25, prerequisites: "DEMO 0 or permission" });
      assert.equal(after.id, before.id);
      assert.deepEqual(after.created_at, before.created_at);
      assert.equal(after.name, "Updated title");
      assert.equal(Number(after.credits), 3.25);
      assert.equal(after.prerequisites, "DEMO 0 or permission");
      const { rows } = await database.query("select count(*)::int as count from public.courses");
      assert.equal(rows[0].count, 2);
    });
  });

  it("enables RLS and lets signed-in students read the catalogue", async () => {
    const { rows: [table] } = await database.query("select relrowsecurity from pg_class where oid = 'public.courses'::regclass");
    assert.equal(table.relrowsecurity, true);
    await asRole("authenticated", async () => {
      const { rows } = await database.query("select code from public.courses");
      assert.equal(rows.length, 2);
    });
  });

  it("blocks anonymous reads despite Supabase's broad default grants", async () => {
    await asRole("anon", async () => {
      await assert.rejects(database.query("select * from public.courses"), (error) => error.code === "42501");
    });
  });

  it("blocks inserts, updates, deletes and truncate for ordinary clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      await asRole(role, async () => {
        for (const sql of [
          "insert into public.courses (code, name, description, credits, department) values ('BAD 1', 'A', 'B', 3, 'Dept')",
          "update public.courses set name = 'Changed'",
          "delete from public.courses",
          "truncate public.courses",
        ]) await assert.rejects(database.query(sql), (error) => error.code === "42501", `${role}: ${sql}`);
      });
    }
  });

  it("enforces required fields, normalized unique codes and credit bounds in Postgres", async () => {
    const original = parseCourseCatalogue(example)[0];
    for (const invalid of [
      { code: "demo 101" }, { code: " DEMO 101" }, { code: "DEMO  101" },
      { code: "DEMO\t101" }, { name: " " }, { description: " " },
      { department: " " }, { credits: -1 }, { credits: "NaN" },
      { code: "A".repeat(33) }, { prerequisites: "x".repeat(10001) },
    ]) {
      await assert.rejects(upsert({ ...original, ...invalid }), (error) => error.code === "23514");
    }
    await assert.rejects(database.query(`
      insert into public.courses (code, name, description, credits, prerequisites, department)
      select code, name, description, credits, prerequisites, department
      from public.courses limit 1
    `), (error) => error.code === "23505" && error.constraint === "courses_code_key");
    await assert.rejects(upsert({ ...original, name: null }), (error) => error.code === "23502");
  });
});
