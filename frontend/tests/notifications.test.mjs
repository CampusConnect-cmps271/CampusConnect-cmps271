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

const readMigration = (file) =>
  readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8");

const migrations = await Promise.all(migrationFiles.map(readMigration));

// The triggers load only for the events tests, so the storage tests can write
// rows without a trigger adding its own.
const events = await readMigration("20261018171000_notification_events.sql");

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

describe("SP2-41 notification events", () => {
  let database;
  let conversationId;
  let beaPost;

  // Housari's SP2-30 migration (PR #12) adds 'removed' to posts' statuses and
  // lets the status guard accept it. Until it is on main, the tests apply the
  // same two changes so the removal trigger runs against that contract.
  const removalContract = `
    alter table public.posts drop constraint posts_status_check;
    alter table public.posts add constraint posts_status_check
      check (status in ('published', 'deleted', 'removed'));

    create or replace function public.protect_post_edit_fields()
    returns trigger
    language plpgsql
    set search_path = ''
    as $$
    begin
      if new.id is distinct from old.id
        or new.author_id is distinct from old.author_id
        or new.created_at is distinct from old.created_at
      then
        raise exception 'Protected post fields cannot be changed';
      end if;

      if old.status in ('deleted', 'removed') then
        raise exception 'Unavailable posts cannot be modified';
      end if;

      if new.status in ('deleted', 'removed') then
        if new.title is distinct from old.title
          or new.body is distinct from old.body
          or new.category is distinct from old.category
          or new.edited_at is distinct from old.edited_at
        then
          raise exception 'Removal can only change post status';
        end if;
      elsif new.status is distinct from 'published' then
        raise exception 'Invalid post status';
      end if;

      return new;
    end;
    $$;
  `;

  async function notificationsOf(userId) {
    return asUser(database, userId, async () => {
      const { rows } = await database.query(
        `select type, actor_id, conversation_id, post_id, comment_id, created_at, read_at
         from public.notifications order by created_at, type`,
      );
      return rows;
    });
  }

  async function sendMessage(senderId, body) {
    return asUser(database, senderId, async () => {
      const { rows } = await database.query(
        `insert into public.messages (conversation_id, sender_id, body)
         values ($1, $2, $3) returning id, created_at`,
        [conversationId, senderId, body],
      );
      return rows[0];
    });
  }

  async function comment(authorId, postId, parentId = null) {
    return asUser(database, authorId, async () => {
      const { rows } = await database.query(
        `insert into public.post_comments (post_id, author_id, parent_id, body)
         values ($1, $2, $3, 'A comment') returning id`,
        [postId, authorId, parentId],
      );
      return rows[0].id;
    });
  }

  async function clearNotifications() {
    await database.query("delete from public.notifications");
  }

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);

    for (const migration of [...migrations, events]) {
      await database.exec(migration);
    }
    await database.exec(removalContract);

    conversationId = await asUser(database, ali, async () => {
      const { rows } = await database.query("select public.start_conversation($1) as id", [bea]);
      return rows[0].id;
    });
    beaPost = await createPost(database, bea, "Bea's post");
  });

  after(async () => {
    await database?.close();
  });

  describe("messages", () => {
    it("notifies the other participant, not the sender", async () => {
      const message = await sendMessage(ali, "Hi Bea");

      assert.deepEqual(await notificationsOf(bea), [{
        type: "message",
        actor_id: ali,
        conversation_id: conversationId,
        post_id: null,
        comment_id: null,
        created_at: message.created_at,
        read_at: null,
      }]);
      assert.deepEqual(await notificationsOf(ali), []);
    });

    it("collapses a run of messages into one unread notification", async () => {
      let last;
      for (let i = 0; i < 5; i++) last = await sendMessage(ali, `Message ${i}`);

      const rows = await notificationsOf(bea);
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].created_at, last.created_at);
      assert.equal(rows[0].read_at, null);
    });

    it("starts a new notification once the last one was read", async () => {
      await asUser(database, bea, async () => {
        await database.query("update public.notifications set read_at = now() where read_at is null");
      });
      await sendMessage(ali, "Another one");

      const rows = await notificationsOf(bea);
      assert.equal(rows.length, 2);
      assert.equal(rows.filter((row) => row.read_at === null).length, 1);
    });

    it("notifies replies in the other direction", async () => {
      await sendMessage(bea, "Hi Ali");

      const rows = await notificationsOf(ali);
      assert.deepEqual(rows.map((row) => [row.type, row.actor_id]), [["message", bea]]);
    });

    it("clears the message notification when the conversation is read", async () => {
      await clearNotifications();
      const message = await sendMessage(ali, "Read me");

      await asUser(database, bea, async () => {
        await database.query(
          `update public.conversation_reads set last_read_at = $1
           where conversation_id = $2 and user_id = $3`,
          [message.created_at, conversationId, bea],
        );
      });

      const [row] = await notificationsOf(bea);
      assert.notEqual(row.read_at, null);
    });
  });

  describe("comments and replies", () => {
    before(async () => {
      await clearNotifications();
    });

    it("notifies a post's author about a comment, not the commenter", async () => {
      const commentId = await comment(ali, beaPost);

      assert.deepEqual(
        (await notificationsOf(bea)).map((row) => [row.type, row.actor_id, row.post_id, row.comment_id]),
        [["post_comment", ali, beaPost, commentId]],
      );
      assert.deepEqual(await notificationsOf(ali), []);
    });

    it("ignores comments on your own post", async () => {
      await clearNotifications();
      await comment(bea, beaPost);

      assert.deepEqual(await notificationsOf(bea), []);
    });

    it("notifies a comment's author about a reply, once", async () => {
      await clearNotifications();
      const beaComment = await comment(bea, beaPost);
      const reply = await comment(ali, beaPost, beaComment);

      // Bea wrote both the post and the comment: one reply notification.
      assert.deepEqual(
        (await notificationsOf(bea)).map((row) => [row.type, row.actor_id, row.comment_id]),
        [["comment_reply", ali, reply]],
      );
    });

    it("notifies both the comment's author and the post's author when they differ", async () => {
      await clearNotifications();
      const camComment = await comment(cam, beaPost);
      await clearNotifications();
      await comment(ali, beaPost, camComment);

      assert.deepEqual((await notificationsOf(cam)).map((row) => row.type), ["comment_reply"]);
      assert.deepEqual((await notificationsOf(bea)).map((row) => row.type), ["post_comment"]);
      assert.deepEqual(await notificationsOf(ali), []);
    });

    it("ignores replies to your own comment", async () => {
      await clearNotifications();
      const beaComment = await comment(bea, beaPost);
      await comment(bea, beaPost, beaComment);

      assert.deepEqual(await notificationsOf(bea), []);
    });
  });

  describe("content removal", () => {
    before(async () => {
      await clearNotifications();
    });

    it("tells the author when a moderator removes their post, without naming the moderator", async () => {
      const postId = await createPost(database, ali, "To be removed");
      await database.query("update public.posts set status = 'removed' where id = $1", [postId]);

      assert.deepEqual(
        (await notificationsOf(ali)).map((row) => [row.type, row.actor_id, row.post_id]),
        [["content_removed", null, postId]],
      );
    });

    it("says nothing when authors delete their own posts", async () => {
      await clearNotifications();
      const postId = await createPost(database, ali, "Deleted by Ali");

      await asUser(database, ali, async () => {
        await database.query("update public.posts set status = 'deleted' where id = $1", [postId]);
      });

      assert.deepEqual(await notificationsOf(ali), []);
    });
  });

  describe("privacy", () => {
    before(async () => {
      await clearNotifications();
      await sendMessage(ali, "Private");
      await comment(ali, beaPost);
    });

    it("hides other students' notifications from a third student", async () => {
      assert.equal((await notificationsOf(bea)).length, 2);
      assert.deepEqual(await notificationsOf(cam), []);
    });

    it("does not let a third student mark them read", async () => {
      await asUser(database, cam, async () => {
        const { affectedRows } = await database.query("update public.notifications set read_at = now()");
        assert.equal(affectedRows, 0);
      });

      assert.ok((await notificationsOf(bea)).every((row) => row.read_at === null));
    });

    it("keeps the trigger functions away from clients", async () => {
      const { rows } = await database.query(
        `select p.proname, r.rolname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join (values ('anon'), ('authenticated')) as r(rolname)
         where n.nspname = 'public'
           and p.proname in ('notify_message_recipient', 'read_message_notifications',
                             'notify_comment_recipients', 'notify_post_removed')
           and has_function_privilege(r.rolname, p.oid, 'execute')`,
      );

      assert.deepEqual(rows, []);
    });
  });
});
