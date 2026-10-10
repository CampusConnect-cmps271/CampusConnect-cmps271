
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261010130000_create_posts.sql",
    import.meta.url,
  ),
  "utf8",
);

const studentId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";

const foundation = `
  create role anon;
  create role authenticated;
  create schema auth;

  create table auth.users (
    id uuid primary key,
    email text
  );

  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(
      current_setting('request.jwt.claim.sub', true), ''
    )::uuid;
  $$;

  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;

  insert into auth.users(id, email) values
    ('${studentId}', 'student@mail.aub.edu'),
    ('${otherId}', 'other@mail.aub.edu');
`;

async function asUser(database, userId, callback) {
  await database.exec(
    `set role authenticated;
     set request.jwt.claim.sub = '${userId}';`,
  );

  try {
    return await callback();
  } finally {
    await database.exec(
      "reset role; reset request.jwt.claim.sub;",
    );
  }
}

describe("SP2-01 post data storage", () => {
  let database;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);
    await database.exec(migration);
  });

  after(async () => {
    await database?.close();
  });

  it("creates the posts table", async () => {
    const { rows } = await database.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'posts'
    `);

    assert.equal(rows.length, 1);
  });

  it("allows students to create their own posts", async () => {
    await asUser(database, studentId, async () => {
      await database.query(
        `insert into public.posts
          (author_id, title, body, category)
         values ($1, $2, $3, $4)`,
        [studentId, "Hello", "My first post", "General"],
      );
    });

    const { rows } = await database.query(
      "select * from public.posts where author_id = $1",
      [studentId],
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "Hello");
    assert.equal(rows[0].status, "published");
  });

  it("prevents students from impersonating another author", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          `insert into public.posts
            (author_id, title, body, category)
           values ($1, $2, $3, $4)`,
          [otherId, "Fake", "Not my post", "General"],
        ),
        (error) => error.code === "42501",
      );
    });
  });

  it("allows students to read published posts", async () => {
    await asUser(database, otherId, async () => {
      const { rows } = await database.query(
        "select title from public.posts",
      );

      assert.equal(rows.length, 1);
      assert.equal(rows[0].title, "Hello");
    });
  });

  it("prevents anonymous users from reading posts", async () => {
    await database.exec("set role anon");

    try {
      await assert.rejects(
        database.query("select * from public.posts"),
        (error) => error.code === "42501",
      );
    } finally {
      await database.exec("reset role");
    }
  });

  it("rejects invalid post titles", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          `insert into public.posts
            (author_id, title, body, category)
           values ($1, $2, $3, $4)`,
          [studentId, "", "Some content", "General"],
        ),
        (error) => error.code === "23514",
      );
    });
  });

  it("prevents students from updating posts", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          "update public.posts set title = 'Changed'",
        ),
        (error) => error.code === "42501",
      );
    });
  });
});
