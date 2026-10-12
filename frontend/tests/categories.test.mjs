
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261010140000_create_categories.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("SP2-04 category list", () => {
  let database;

  before(async () => {
    database = new PGlite();

    await database.exec(`
      create role anon;
      create role authenticated;
    `);

    await database.exec(migration);
  });

  after(async () => {
    await database?.close();
  });

  it("creates five categories", async () => {
    const { rows } = await database.query(
      "select name from public.categories order by id",
    );

    assert.deepEqual(
      rows.map((row) => row.name),
      [
        "Academics",
        "Campus Life",
        "Housing",
        "Clubs & Events",
        "General",
      ],
    );
  });

  it("enables Row Level Security", async () => {
    const { rows } = await database.query(`
      select relrowsecurity
      from pg_class
      where oid = 'public.categories'::regclass
    `);

    assert.equal(rows[0].relrowsecurity, true);
  });

  it("allows authenticated users to read categories", async () => {
    await database.exec("set role authenticated");

    try {
      const { rows } = await database.query(
        "select name from public.categories",
      );

      assert.equal(rows.length, 5);
    } finally {
      await database.exec("reset role");
    }
  });

  it("prevents anonymous users from reading categories", async () => {
    await database.exec("set role anon");

    try {
      await assert.rejects(
        database.query("select * from public.categories"),
        (error) => error.code === "42501",
      );
    } finally {
      await database.exec("reset role");
    }
  });

  it("prevents students from inserting categories", async () => {
    await database.exec("set role authenticated");

    try {
      await assert.rejects(
        database.query(
          "insert into public.categories(name) values ('Other')",
        ),
        (error) => error.code === "42501",
      );
    } finally {
      await database.exec("reset role");
    }
  });
});
