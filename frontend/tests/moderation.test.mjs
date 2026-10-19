import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const readMigration = (name) =>
  readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

const migrations = await Promise.all([
  "20261005010000_roles_and_permissions.sql",
  "20261010130000_create_posts.sql",
  "20261010150000_allow_post_editing.sql",
  "20261010160000_fix_post_editing_permissions.sql",
  "20261011130000_allow_post_deletion.sql",
  "20261011140000_fix_post_deletion_rls.sql",
  "20261011160000_fix_deleted_post_visibility.sql",
  "20261011170000_create_post_upvotes.sql",
  "20261012100000_create_post_comments.sql",
  "20261018123712_sprint2_moderation.sql",
].map(readMigration));

const studentId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const moderatorId = "00000000-0000-4000-8000-000000000003";
const adminId = "00000000-0000-4000-8000-000000000004";
const postId = "00000000-0000-4000-8000-0000000000a1";
const commentId = "00000000-0000-4000-8000-0000000000b1";

const foundation = `
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid()
  returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  insert into auth.users(id, email) values
    ('${studentId}', 'student@mail.aub.edu'),
    ('${otherId}', 'other@mail.aub.edu'),
    ('${moderatorId}', 'moderator@mail.aub.edu'),
    ('${adminId}', 'admin@mail.aub.edu');
`;

async function asUser(database, userId, callback) {
  await database.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await database.exec("reset role; reset request.jwt.claim.sub;");
  }
}

describe("Sprint 2 moderation database security", () => {
  let database;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);
    for (const migration of migrations) await database.exec(migration);
    await database.exec(`
      update public.user_roles set role = 'moderator' where user_id = '${moderatorId}';
      update public.user_roles set role = 'administrator' where user_id = '${adminId}';
      insert into public.posts (id, author_id, title, body, category)
      values ('${postId}', '${otherId}', 'Reported post', 'Post body', 'General');
      insert into public.post_comments (id, post_id, author_id, body)
      values ('${commentId}', '${postId}', '${otherId}', 'Reported comment');
    `);
  });

  after(async () => database?.close());

  it("lets a student report a post once without reading moderation data", async () => {
    await asUser(database, studentId, async () => {
      await database.query(
        `insert into public.content_reports (reporter_id, post_id, reason, details)
         values ($1, $2, 'misleading', 'Incorrect information')`,
        [studentId, postId],
      );

      const hidden = await database.query("select * from public.content_reports");
      assert.equal(hidden.rows.length, 0);

      await assert.rejects(
        database.query(
          `insert into public.content_reports (reporter_id, post_id, reason)
           values ($1, $2, 'spam')`,
          [studentId, postId],
        ),
        (error) => error.code === "23505",
      );
    });
  });

  it("groups reports for moderators and rejects students from the queue", async () => {
    await asUser(database, otherId, async () => {
      await database.query(
        `insert into public.content_reports (reporter_id, post_id, reason)
         values ($1, $2, 'spam')`,
        [otherId, postId],
      );
    });

    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query("select * from public.moderation_queue()"),
        (error) => error.code === "42501",
      );
    });

    await asUser(database, moderatorId, async () => {
      const { rows } = await database.query("select * from public.moderation_queue()");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].target_type, "post");
      assert.equal(Number(rows[0].report_count), 2);
      assert.deepEqual(rows[0].reasons, ["misleading", "spam"]);
    });
  });

  it("removes reported content, closes every report, and writes an audit event", async () => {
    await asUser(database, studentId, async () => {
      await database.query(
        `insert into public.content_reports (reporter_id, comment_id, reason)
         values ($1, $2, 'offensive')`,
        [studentId, commentId],
      );
    });

    await asUser(database, moderatorId, async () => {
      await database.query(
        "select public.moderate_reported_content('comment', $1, 'remove', 'Violates community rules')",
        [commentId],
      );
    });

    const comment = await database.query(
      "select status from public.post_comments where id = $1",
      [commentId],
    );
    assert.equal(comment.rows[0].status, "removed");

    const report = await database.query(
      "select status from public.content_reports where comment_id = $1",
      [commentId],
    );
    assert.equal(report.rows[0].status, "removed");

    const audit = await database.query(
      "select actor_id, action from public.audit_log where target_id = $1",
      [commentId],
    );
    assert.deepEqual(audit.rows[0], {
      actor_id: moderatorId,
      action: "content.removed",
    });
  });

  it("prevents direct audit writes and exposes audit rows only to administrators", async () => {
    await asUser(database, moderatorId, async () => {
      await assert.rejects(
        database.query(
          `insert into public.audit_log (actor_id, action, target_type)
           values ($1, 'fake.event', 'user')`,
          [moderatorId],
        ),
        (error) => error.code === "42501",
      );
      const hidden = await database.query("select * from public.audit_log");
      assert.equal(hidden.rows.length, 0);
    });

    await asUser(database, adminId, async () => {
      const { rows } = await database.query(
        "select action, actor_email from public.admin_list_audit_log(null, 'moderator@', 100)",
      );
      assert.equal(rows[0].action, "content.removed");
      assert.equal(rows[0].actor_email, "moderator@mail.aub.edu");
    });
  });

  it("lets an author soft-delete their own post", async () => {
    const ownPostId = "00000000-0000-4000-8000-0000000000a2";

    await asUser(database, studentId, async () => {
      await database.query(
        `insert into public.posts (id, author_id, title, body, category)
         values ($1, $2, 'My post', 'My body', 'General')`,
        [ownPostId, studentId],
      );

      const deleted = await database.query(
        `update public.posts set status = 'deleted'
         where id = $1 and author_id = $2 and status = 'published'`,
        [ownPostId, studentId],
      );
      assert.equal(deleted.affectedRows, 1);
    });

    await asUser(database, otherId, async () => {
      const visible = await database.query("select id from public.posts where id = $1", [ownPostId]);
      assert.equal(visible.rows.length, 0);
    });
  });

  it("blocks suspended open sessions from posts, comments, votes, and reports", async () => {
    await asUser(database, adminId, async () => {
      await database.query(
        "select public.admin_set_suspension($1, 'Repeated violations', null)",
        [studentId],
      );
    });

    await asUser(database, studentId, async () => {
      const current = await database.query("select * from public.current_suspension()");
      assert.equal(current.rows[0].reason, "Repeated violations");

      await assert.rejects(
        database.query(
          `insert into public.posts (author_id, title, body, category)
           values ($1, 'Blocked', 'Blocked', 'General')`,
          [studentId],
        ),
        (error) => error.code === "42501",
      );
      await assert.rejects(
        database.query(
          `insert into public.post_comments (post_id, author_id, body)
           values ($1, $2, 'Blocked')`,
          [postId, studentId],
        ),
        (error) => error.code === "42501",
      );
      await assert.rejects(
        database.query(
          "insert into public.post_upvotes (post_id, user_id) values ($1, $2)",
          [postId, studentId],
        ),
        (error) => error.code === "42501",
      );
      await assert.rejects(
        database.query(
          `insert into public.content_reports (reporter_id, post_id, reason)
           values ($1, $2, 'other')`,
          [studentId, postId],
        ),
        (error) => error.code === "42501" || error.code === "23505",
      );
    });
  });

  it("lets administrators lift a suspension and records role changes", async () => {
    await asUser(database, adminId, async () => {
      await database.query(
        "select public.admin_lift_suspension($1, 'Appeal approved')",
        [studentId],
      );
      await database.query(
        "select public.admin_assign_role($1, 'club_representative'::public.app_role)",
        [studentId],
      );
    });

    await asUser(database, studentId, async () => {
      const current = await database.query("select * from public.current_suspension()");
      assert.equal(current.rows.length, 0);
      await database.query(
        `insert into public.posts (author_id, title, body, category)
         values ($1, 'Allowed again', 'Appeal succeeded', 'General')`,
        [studentId],
      );
    });

    const actions = await database.query(
      "select action from public.audit_log where target_id = $1 order by id",
      [studentId],
    );
    assert.deepEqual(
      actions.rows.map((row) => row.action),
      ["account.suspended", "account.suspension_lifted", "role.assigned"],
    );
  });
});

