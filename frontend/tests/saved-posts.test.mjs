import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (name) =>
  readFile(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );

const postsMigration = await read("20261010130000_create_posts.sql");
const savedMigration = await read("20261012110000_create_saved_posts.sql");

const studentId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const postId = "00000000-0000-4000-8000-0000000000a1";
const deletedPostId = "00000000-0000-4000-8000-0000000000a3";

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
    await database.exec("reset role; reset request.jwt.claim.sub;");
  }
}

describe("SP2-21 saved-post storage", () => {
  let database;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);
    await database.exec(postsMigration);
    await database.exec(savedMigration);

    await database.exec(`
      insert into public.posts (id, author_id, title, body, category, status)
      values
        ('${postId}', '${studentId}', 'One', 'Body', 'General', 'published'),
        ('${deletedPostId}', '${studentId}', 'Gone', 'Body', 'General', 'deleted');
    `);
  });

  after(async () => {
    await database?.close();
  });

  it("lets a student save a published post", async () => {
    await asUser(database, studentId, async () => {
      await database.query(
        "insert into public.saved_posts (user_id, post_id) values ($1, $2)",
        [studentId, postId],
      );

      const { rows } = await database.query(
        "select post_id from public.saved_posts",
      );

      assert.equal(rows.length, 1);
      assert.equal(rows[0].post_id, postId);
    });
  });

  it("prevents saving the same post twice", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          "insert into public.saved_posts (user_id, post_id) values ($1, $2)",
          [studentId, postId],
        ),
        (error) => error.code === "23505",
      );
    });
  });

  it("prevents saving a post as someone else", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          "insert into public.saved_posts (user_id, post_id) values ($1, $2)",
          [otherId, postId],
        ),
        (error) => error.code === "42501",
      );
    });
  });

  it("prevents saving a deleted post", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          "insert into public.saved_posts (user_id, post_id) values ($1, $2)",
          [studentId, deletedPostId],
        ),
        (error) => error.code === "42501",
      );
    });
  });

  it("keeps saved posts private to their owner", async () => {
    await asUser(database, otherId, async () => {
      const { rows } = await database.query(
        "select * from public.saved_posts",
      );

      assert.equal(rows.length, 0);
    });
  });

  it("blocks anonymous users", async () => {
    await database.exec("set role anon");

    try {
      await assert.rejects(
        database.query("select * from public.saved_posts"),
        (error) => error.code === "42501",
      );
    } finally {
      await database.exec("reset role");
    }
  });

  it("does not let another student remove someone's save", async () => {
    await asUser(database, otherId, async () => {
      await database.query("delete from public.saved_posts");
    });

    const { rows } = await database.query(
      "select * from public.saved_posts",
    );

    assert.equal(rows.length, 1);
  });

  it("lets a student unsave their own post", async () => {
    await asUser(database, studentId, async () => {
      await database.query(
        "delete from public.saved_posts where post_id = $1",
        [postId],
      );

      const { rows } = await database.query(
        "select * from public.saved_posts",
      );

      assert.equal(rows.length, 0);
    });
  });

  it("removes saves when the post is deleted", async () => {
    await asUser(database, studentId, async () => {
      await database.query(
        "insert into public.saved_posts (user_id, post_id) values ($1, $2)",
        [studentId, postId],
      );
    });

    await database.query("delete from public.posts where id = $1", [postId]);

    const { rows } = await database.query(
      "select * from public.saved_posts",
    );

    assert.equal(rows.length, 0);
  });
});
