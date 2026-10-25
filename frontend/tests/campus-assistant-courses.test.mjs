import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const [coursesMigration, searchMigration] = await Promise.all([
  read("20261017091812_create_courses.sql"),
  read("20261024110000_campus_assistant_course_search.sql"),
]);

describe("SCRUM-51 campus assistant course search", () => {
  let db;
  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    `);
    await db.exec(coursesMigration);
    await db.exec(searchMigration);
    const add = (code, name, department, description, prerequisites = "") => db.query(
      "insert into public.courses(code,name,description,credits,prerequisites,department) values($1,$2,$3,3,$4,$5)",
      [code, name, description, prerequisites, department],
    );
    await add("CMPS 271", "Software Engineering", "Computer Science", "Team-based software development and testing.", "CMPS 200");
    await add("CMPS 200", "Programming Fundamentals", "Computer Science", "Introduction to programming in Python.");
    await add("MATH 201", "Calculus III", "Mathematics", "Multivariable calculus and software for numerical work.");
    await add("ARAB 201", "Arabic Composition", "Arabic", "كتابة النصوص العربية وتحليلها.");
    await add("LONG 100", "Long Description", "Testing", "x".repeat(5000));
  });
  after(async () => { await db?.close(); });

  async function search(query, limit) {
    await db.exec("set role authenticated");
    try { return (await db.query("select * from public.search_campus_courses($1,$2)", [query, limit])).rows; }
    finally { await db.exec("reset role"); }
  }

  it("finds a course by its code and ranks it first", async () => {
    const rows = await search("cmps 271");
    assert.equal(rows[0].code, "CMPS 271");
    assert.equal(rows[0].prerequisites, "CMPS 200");
  });

  it("ranks a course named by its code above courses that merely mention the words", async () => {
    await db.query(
      "insert into public.courses(code,name,description,credits,prerequisites,department) values('MATH 202','Calculus',$1,3,'','Mathematics')",
      ["Math math math 201 math 201 math 201 with many repeated math terms."],
    );
    const rows = await search("math 201");
    assert.equal(rows[0].code, "MATH 201");
  });

  it("matches word forms in names and descriptions, with name matches above description matches", async () => {
    const rows = await search("software engineer");
    assert.deepEqual(rows.map((row) => row.code), ["CMPS 271", "MATH 201"]);
  });

  it("finds Arabic descriptions", async () => {
    assert.deepEqual((await search("العربية")).map((row) => row.code), ["ARAB 201"]);
  });

  it("returns nothing for empty, null or unmatched queries", async () => {
    for (const query of ["", "   ", null, "zzzzzz", "!!!"]) assert.deepEqual(await search(query), []);
  });

  it("clamps the limit to 1..5 rows and cuts long descriptions to 800 characters", async () => {
    assert.equal((await search("cmps software programming calculus", 0)).length, 1);
    assert.ok((await search("cmps software programming calculus", 500)).length <= 5);
    assert.equal((await search("long description"))[0].description.length, 800);
  });

  it("is readable by students but not by anonymous users", async () => {
    await db.exec("set role anon");
    try {
      assert.deepEqual((await db.query("select * from public.search_campus_courses('cmps')")).rows, []);
    } catch (error) {
      assert.match(error.message, /permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
