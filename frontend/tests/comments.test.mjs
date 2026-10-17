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
const commentsMigration = await read(
  "20261012100000_create_post_comments.sql",
);

const studentId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const postId = "00000000-0000-4000-8000-0000000000a1";
const otherPostId = "00000000-0000-4000-8000-0000000000a2";
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

describe("SP2-12 comment data storage", () => {
  let database;
  let topLevelId;
  let replyId;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);
    await database.exec(postsMigration);
    await database.exec(commentsMigration);

    await database.exec(`
      insert into public.posts (id, author_id, title, body, category, status)
      values
        ('${postId}', '${studentId}', 'One', 'Body', 'General', 'published'),
        ('${otherPostId}', '${studentId}', 'Two', 'Body', 'General', 'published'),
        ('${deletedPostId}', '${studentId}', 'Gone', 'Body', 'General', 'deleted');
    `);
  });

  after(async () => {
    await database?.close();
  });

  it("allows students to comment on a published post", async () => {
    await asUser(database, studentId, async () => {
      const { rows } = await database.query(
        `insert into public.post_comments (post_id, author_id, body)
         values ($1, $2, $3)
         returning id`,
        [postId, studentId, "First!"],
      );

      topLevelId = rows[0].id;
    });

    assert.ok(topLevelId);
  });

  it("prevents students from commenting as someone else", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          `insert into public.post_comments (post_id, author_id, body)
           values ($1, $2, $3)`,
          [postId, otherId, "Impersonation"],
        ),
        (error) => error.code === "42501",
      );
    });
  });

  it("prevents commenting on a deleted post", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          `insert into public.post_comments (post_id, author_id, body)
           values ($1, $2, $3)`,
          [deletedPostId, studentId, "Too late"],
        ),
        (error) => error.code === "42501",
      );
    });
  });

  it("rejects empty and oversized comments", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          `insert into public.post_comments (post_id, author_id, body)
           values ($1, $2, $3)`,
          [postId, studentId, "   "],
        ),
        (error) => error.code === "23514",
      );

      await assert.rejects(
        database.query(
          `insert into public.post_comments (post_id, author_id, body)
           values ($1, $2, $3)`,
          [postId, studentId, "a".repeat(2001)],
        ),
        (error) => error.code === "23514",
      );
    });
  });

  it("lets other students read comments on published posts", async () => {
    await asUser(database, otherId, async () => {
      const { rows } = await database.query(
        "select body from public.post_comments where post_id = $1",
        [postId],
      );

      assert.equal(rows.length, 1);
      assert.equal(rows[0].body, "First!");
    });
  });

  it("blocks anonymous users from reading comments", async () => {
    await database.exec("set role anon");

    try {
      await assert.rejects(
        database.query("select * from public.post_comments"),
        (error) => error.code === "42501",
      );
    } finally {
      await database.exec("reset role");
    }
  });

  it("prevents students from editing or deleting comments", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query("update public.post_comments set body = 'x'"),
        (error) => error.code === "42501",
      );

      await assert.rejects(
        database.query("delete from public.post_comments"),
        (error) => error.code === "42501",
      );
    });
  });

  describe("SP2-14 comment replies", () => {
    it("allows a reply to a top-level comment", async () => {
      await asUser(database, otherId, async () => {
        const { rows } = await database.query(
          `insert into public.post_comments
             (post_id, author_id, parent_id, body)
           values ($1, $2, $3, $4)
           returning id`,
          [postId, otherId, topLevelId, "Welcome"],
        );

        replyId = rows[0].id;
      });

      assert.ok(replyId);
    });

    it("rejects a reply nested under another reply", async () => {
      await asUser(database, studentId, async () => {
        await assert.rejects(
          database.query(
            `insert into public.post_comments
               (post_id, author_id, parent_id, body)
             values ($1, $2, $3, $4)`,
            [postId, studentId, replyId, "Too deep"],
          ),
          (error) => error.code === "23514",
        );
      });
    });

    it("rejects a reply whose parent is on a different post", async () => {
      await asUser(database, studentId, async () => {
        await assert.rejects(
          database.query(
            `insert into public.post_comments
               (post_id, author_id, parent_id, body)
             values ($1, $2, $3, $4)`,
            [otherPostId, studentId, topLevelId, "Wrong post"],
          ),
          (error) => error.code === "23503",
        );
      });
    });
  });
});
