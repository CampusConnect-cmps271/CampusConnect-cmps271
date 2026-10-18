import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Notifications link to conversations, posts and comments, so those
// migrations load first, in the order they run on Supabase.
const migrationFiles = [
  "20261010130000_create_posts.sql",
  "20261010150000_allow_post_editing.sql",
  "20261010160000_fix_post_editing_permissions.sql",
  "20261011130000_allow_post_deletion.sql",
  "20261011140000_fix_post_deletion_rls.sql",
  "20261011160000_fix_deleted_post_visibility.sql",
  "20261012100000_create_post_comments.sql",
  "20261014100000_create_profiles.sql",
  "20261018160000_create_messaging.sql",
  "20261018170000_create_notifications.sql",
];

const migrations = await Promise.all(
  migrationFiles.map((file) =>
    readFile(
      new URL(`../../supabase/migrations/${file}`, import.meta.url),
      "utf8",
    ),
  ),
);

const ali = "00000000-0000-4000-8000-0000000000e1";
const bea = "00000000-0000-4000-8000-0000000000e2";
const cam = "00000000-0000-4000-8000-0000000000e3";

// Supabase grants anon and authenticated every privilege on new tables and
// functions by default. Reproduce that, so the tests prove the migration's
// revokes rather than an empty starting point. The publication stands in for
// the one every Supabase project has.
const foundation = `
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;

  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb
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

  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;

  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;

  create publication supabase_realtime;

  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ali}', 'ali@mail.aub.edu', '{"full_name": "Ali Hassan"}'),
    ('${bea}', 'bea@mail.aub.edu', '{"full_name": "Bea Khoury"}'),
    ('${cam}', 'cam@mail.aub.edu', '{"full_name": "Cam Saad"}');
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

async function createPost(database, authorId, title = "A post") {
  const { rows } = await database.query(
    `insert into public.posts (author_id, title, body, category)
     values ($1, $2, 'Body', 'General') returning id`,
    [authorId, title],
  );
  return rows[0].id;
}

/** A row as the triggers would write it; tests of storage write it directly. */
async function insertNotification(database, values) {
  const columns = Object.keys(values);
  const { rows } = await database.query(
    `insert into public.notifications (${columns.join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")})
     returning id`,
    Object.values(values),
  );
  return rows[0].id;
}

const isCode = (code) => (error) => error.code === code;

describe("SP2-40 notification data storage", () => {
  let database;
  let postId;
  let commentId;
  let beaNotification;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);

    for (const migration of migrations) {
      await database.exec(migration);
    }

    postId = await createPost(database, bea);
    const { rows } = await database.query(
      `insert into public.post_comments (post_id, author_id, body)
       values ($1, $2, 'Nice post') returning id`,
      [postId, ali],
    );
    commentId = rows[0].id;

    beaNotification = await insertNotification(database, {
      recipient_id: bea,
      type: "post_comment",
      actor_id: ali,
      post_id: postId,
      comment_id: commentId,
    });
  });

  after(async () => {
    await database?.close();
  });

  it("lets a student read only their own notifications", async () => {
    await asUser(database, bea, async () => {
      const { rows } = await database.query("select id, type from public.notifications");
      assert.deepEqual(rows, [{ id: beaNotification, type: "post_comment" }]);
    });

    for (const userId of [ali, cam]) {
      await asUser(database, userId, async () => {
        const { rows } = await database.query("select id from public.notifications");
        assert.deepEqual(rows, []);
      });
    }
  });

  it("keeps notifications away from signed-out visitors", async () => {
    await database.exec("set role anon");

    try {
      await assert.rejects(
        database.query("select * from public.notifications"),
        isCode("42501"),
      );
    } finally {
      await database.exec("reset role");
    }
  });

  it("lets the recipient mark their own notification read, and no one else", async () => {
    await asUser(database, cam, async () => {
      const { affectedRows } = await database.query(
        "update public.notifications set read_at = now() where id = $1",
        [beaNotification],
      );
      assert.equal(affectedRows, 0);
    });

    await asUser(database, bea, async () => {
      const { affectedRows } = await database.query(
        "update public.notifications set read_at = now() where id = $1",
        [beaNotification],
      );
      assert.equal(affectedRows, 1);
    });
  });

  it("protects every column except read_at", async () => {
    await asUser(database, bea, async () => {
      for (const assignment of [
        `recipient_id = '${cam}'`,
        "type = 'message'",
        `actor_id = '${bea}'`,
        "created_at = now()",
      ]) {
        await assert.rejects(
          database.query(`update public.notifications set ${assignment} where id = $1`, [
            beaNotification,
          ]),
          isCode("42501"),
          assignment,
        );
      }
    });
  });

  it("does not let clients create or delete notifications", async () => {
    await asUser(database, bea, async () => {
      await assert.rejects(
        database.query(
          `insert into public.notifications (recipient_id, type, actor_id, post_id, comment_id)
           values ($1, 'post_comment', $2, $3, $4)`,
          [bea, ali, postId, commentId],
        ),
        isCode("42501"),
      );
      await assert.rejects(
        database.query("delete from public.notifications where id = $1", [beaNotification]),
        isCode("42501"),
      );
    });
  });

  it("requires the links each type needs, and only the known types", async () => {
    const invalid = [
      { recipient_id: bea, type: "message", actor_id: ali },
      { recipient_id: bea, type: "post_comment", actor_id: ali, post_id: postId },
      { recipient_id: bea, type: "comment_reply", post_id: postId, comment_id: commentId },
      { recipient_id: bea, type: "content_removed" },
      { recipient_id: bea, type: "upvote", actor_id: ali, post_id: postId },
    ];

    for (const values of invalid) {
      await assert.rejects(
        insertNotification(database, values),
        isCode("23514"),
        JSON.stringify(values),
      );
    }
  });

  it("allows one unread message notification per conversation", async () => {
    const { rows } = await database.query(
      "insert into public.conversations (student_a, student_b) values ($1, $2) returning id",
      [ali, bea].sort(),
    );
    const conversationId = rows[0].id;
    const message = { recipient_id: bea, type: "message", actor_id: ali, conversation_id: conversationId };

    const first = await insertNotification(database, message);
    await assert.rejects(insertNotification(database, message), isCode("23505"));

    // Once read, a new one may start.
    await database.query("update public.notifications set read_at = now() where id = $1", [first]);
    await insertNotification(database, message);
  });

  it("deletes read notifications after 60 days and keeps the rest", async () => {
    await database.query("delete from public.notifications");
    const base = { recipient_id: bea, type: "post_comment", actor_id: ali, post_id: postId, comment_id: commentId };
    const oldRead = await insertNotification(database, {
      ...base, created_at: "2020-01-01", read_at: "2020-01-02",
    });
    const oldUnread = await insertNotification(database, { ...base, created_at: "2020-01-01" });
    const recentRead = await insertNotification(database, { ...base, read_at: new Date().toISOString() });

    const { rows } = await database.query("select public.delete_old_read_notifications() as deleted");
    assert.equal(rows[0].deleted, 1);

    const { rows: left } = await database.query("select id from public.notifications order by id");
    assert.deepEqual(left.map((row) => row.id).sort(), [oldUnread, recentRead].sort());
    assert.ok(!left.some((row) => row.id === oldRead));
  });

  it("keeps the retention function away from clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      await database.exec(`set role ${role}`);
      try {
        await assert.rejects(
          database.query("select public.delete_old_read_notifications()"),
          isCode("42501"),
          role,
        );
      } finally {
        await database.exec("reset role");
      }
    }
  });

  it("streams notifications through Realtime", async () => {
    const { rows } = await database.query(
      `select tablename from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' order by tablename`,
    );

    assert.deepEqual(rows.map((row) => row.tablename), ["messages", "notifications"]);
  });
});
