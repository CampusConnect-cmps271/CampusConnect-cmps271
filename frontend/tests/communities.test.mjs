import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Community posts are posts, and archiving writes the moderation audit log,
// so the roles, posts and moderation migrations load first, in the order
// they run on Supabase.
const migrationFiles = [
  "20261005010000_roles_and_permissions.sql",
  "20261010130000_create_posts.sql",
  "20261010140000_create_categories.sql",
  "20261010150000_allow_post_editing.sql",
  "20261010160000_fix_post_editing_permissions.sql",
  "20261011130000_allow_post_deletion.sql",
  "20261011140000_fix_post_deletion_rls.sql",
  "20261011160000_fix_deleted_post_visibility.sql",
  "20261011170000_create_post_upvotes.sql",
  "20261012100000_create_post_comments.sql",
  "20261017091812_create_courses.sql",
  "20261018123712_sprint2_moderation.sql",
  "20261018200000_create_skillswap.sql",
  "20261116220710_communities.sql",
];

const migrations = await Promise.all(
  migrationFiles.map((file) =>
    readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"),
  ),
);

const ownerId = "00000000-0000-4000-8000-000000000001";
const memberId = "00000000-0000-4000-8000-000000000002";
const outsiderId = "00000000-0000-4000-8000-000000000003";
const moderatorId = "00000000-0000-4000-8000-000000000004";
const adminId = "00000000-0000-4000-8000-000000000005";
const suspendedId = "00000000-0000-4000-8000-000000000006";
const busyId = "00000000-0000-4000-8000-000000000007";
const cmps271 = "10000000-0000-4000-8000-000000000001";

// Supabase grants anon and authenticated every privilege on new tables and
// functions by default. Reproduce that, so the tests prove the migration's
// revokes rather than an empty starting point.
const foundation = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid()
  returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  insert into auth.users(id, email) values
    ('${ownerId}', 'owner@mail.aub.edu'),
    ('${memberId}', 'member@mail.aub.edu'),
    ('${outsiderId}', 'outsider@mail.aub.edu'),
    ('${moderatorId}', 'moderator@mail.aub.edu'),
    ('${adminId}', 'admin@mail.aub.edu'),
    ('${suspendedId}', 'suspended@mail.aub.edu'),
    ('${busyId}', 'busy@mail.aub.edu');
`;

async function asUser(database, userId, callback) {
  await database.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await database.exec("reset role; reset request.jwt.claim.sub;");
  }
}

const isCode = (code) => (error) => {
  assert.equal(error.code, code, error.message);
  return true;
};

async function createCommunity(database, userId, name, { description = null, topic = "interest", courseId = null } = {}) {
  return asUser(database, userId, async () => {
    const { rows } = await database.query("select * from public.create_community($1, $2, $3, $4)", [
      name,
      description,
      topic,
      courseId,
    ]);
    return rows[0];
  });
}

async function postIn(database, userId, communityId, title = "Midterm review", category = "Academics") {
  return asUser(database, userId, async () => {
    const { rows } = await database.query("select public.create_community_post($1, $2, $3, $4) as id", [
      communityId,
      title,
      "Who wants to review chapters 3 and 4 together?",
      category,
    ]);
    return rows[0].id;
  });
}

async function rows(database, sql, params = []) {
  return (await database.query(sql, params)).rows;
}

describe("SP4-04 communities", () => {
  let database;
  let studyGroup;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);
    for (const migration of migrations) await database.exec(migration);
    await database.exec(`
      update public.user_roles set role = 'moderator' where user_id = '${moderatorId}';
      update public.user_roles set role = 'administrator' where user_id = '${adminId}';
      insert into public.courses (id, code, name, description, credits, department)
      values ('${cmps271}', 'CMPS 271', 'Software Engineering', 'Test course.', 3, 'Computer Science');
      insert into public.user_suspensions (user_id, reason, suspended_by)
      values ('${suspendedId}', 'Test suspension', '${adminId}');
    `);
    studyGroup = await createCommunity(database, ownerId, "  CMPS 271   study group ", {
      description: " Weekly reviews before the midterm. ",
      topic: "course",
      courseId: cmps271,
    });
  });

  after(async () => database?.close());

  describe("creating", () => {
    it("creates the community with its owner's membership and follow, and a slug from the name", async () => {
      assert.equal(studyGroup.slug, "cmps-271-study-group");
      const [community] = await rows(
        database,
        "select name, description, topic, course_id, owner_id, status from public.communities where id = $1",
        [studyGroup.id],
      );
      assert.deepEqual(community, {
        name: "CMPS 271 study group",
        description: "Weekly reviews before the midterm.",
        topic: "course",
        course_id: cmps271,
        owner_id: ownerId,
        status: "active",
      });
      assert.deepEqual(
        await rows(database, "select student_id, role from public.community_members where community_id = $1", [studyGroup.id]),
        [{ student_id: ownerId, role: "owner" }],
      );
      assert.deepEqual(
        await rows(database, "select student_id from public.community_follows where community_id = $1", [studyGroup.id]),
        [{ student_id: ownerId }],
      );
    });

    it("refuses a second active community with the same name, ignoring case", async () => {
      await assert.rejects(createCommunity(database, memberId, "cmps 271 STUDY group"), isCode("23505"));
    });

    it("builds slugs from punctuation and non-Latin names and numbers clashes", async () => {
      const chess = await createCommunity(database, memberId, "Chess & Coffee!!");
      assert.equal(chess.slug, "chess-coffee");
      const arabic = await createCommunity(database, outsiderId, "نادي القراءة");
      assert.equal(arabic.slug, "community");
      const arabic2 = await createCommunity(database, outsiderId, "سكن الطلاب");
      assert.equal(arabic2.slug, "community-2");
      const clash = await createCommunity(database, outsiderId, "Chess -- coffee");
      assert.equal(clash.slug, "chess-coffee-2");
      const long = await createCommunity(database, adminId, `${"Very long name ".repeat(5)}end`);
      assert.ok(long.slug.length <= 60, long.slug);
      assert.match(long.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it("needs a course for a course community and none for any other topic", async () => {
      await assert.rejects(createCommunity(database, adminId, "No course here", { topic: "course" }), isCode("23514"));
      await assert.rejects(
        createCommunity(database, adminId, "Course on an interest", { topic: "interest", courseId: cmps271 }),
        isCode("23514"),
      );
      await assert.rejects(createCommunity(database, adminId, "Bad topic", { topic: "sports" }), isCode("23514"));
      // Several communities may share a course.
      const second = await createCommunity(database, adminId, "CMPS 271 project teams", { topic: "course", courseId: cmps271 });
      assert.equal(second.slug, "cmps-271-project-teams");
    });

    it("refuses names that are too short or too long and descriptions over 500 characters", async () => {
      await assert.rejects(createCommunity(database, moderatorId, "  ab "), isCode("23514"));
      await assert.rejects(createCommunity(database, moderatorId, "x".repeat(81)), isCode("23514"));
      await assert.rejects(createCommunity(database, moderatorId, "Long description", { description: "x".repeat(501) }), isCode("23514"));
    });

    it("allows three communities a day per student", async () => {
      for (const name of ["Busy one", "Busy two", "Busy three"]) await createCommunity(database, busyId, name);
      await assert.rejects(createCommunity(database, busyId, "Busy four"), isCode("CM001"));
    });

    it("allows twenty active communities per owner", async () => {
      // Created on earlier days, so only the total limit applies.
      await database.exec(`
        update public.communities set created_at = now() - interval '2 days' where owner_id = '${busyId}';
        insert into public.communities (name, topic, owner_id, created_at)
        select 'Older busy ' || n, 'other', '${busyId}', now() - interval '3 days'
        from generate_series(1, 17) as n;
      `);
      await assert.rejects(createCommunity(database, busyId, "One too many"), isCode("CM002"));
    });

    it("refuses a suspended student, like posts do", async () => {
      await assert.rejects(createCommunity(database, suspendedId, "Suspended club"), isCode("42501"));
    });

    it("refuses direct inserts into communities and community posts", async () => {
      await asUser(database, ownerId, async () => {
        await assert.rejects(
          database.query("insert into public.communities (name, topic, owner_id, slug) values ('Direct', 'other', $1, 'direct')", [ownerId]),
          isCode("42501"),
        );
        const { rows: [post] } = await database.query(
          "insert into public.posts (author_id, title, body, category) values ($1, 'Plain post', 'Body', 'General') returning id",
          [ownerId],
        );
        await assert.rejects(
          database.query("insert into public.community_posts (post_id, community_id) values ($1, $2)", [post.id, studyGroup.id]),
          isCode("42501"),
        );
        // Nor can the linking helper move an existing post into a community.
        await assert.rejects(
          database.query("select public.link_community_post($1, $2)", [post.id, studyGroup.id]),
          isCode("P0002"),
        );
      });
    });

    it("gives signed-out visitors nothing", async () => {
      await database.exec("set role anon;");
      try {
        await assert.rejects(database.query("select * from public.communities"), isCode("42501"));
        await assert.rejects(database.query("select * from public.community_overview"), isCode("42501"));
        await assert.rejects(database.query("select * from public.create_community('Anon', null, 'other', null)"), isCode("42501"));
      } finally {
        await database.exec("reset role;");
      }
    });
  });

  describe("membership", () => {
    it("joins as yourself, which also follows", async () => {
      await asUser(database, memberId, () => database.query("select public.join_community($1)", [studyGroup.id]));
      assert.deepEqual(
        await rows(
          database,
          "select role from public.community_members where community_id = $1 and student_id = $2",
          [studyGroup.id, memberId],
        ),
        [{ role: "member" }],
      );
      assert.equal(
        (await rows(database, "select 1 from public.community_follows where community_id = $1 and student_id = $2", [studyGroup.id, memberId])).length,
        1,
      );
    });

    it("never joins, follows, leaves or unfollows for someone else", async () => {
      await asUser(database, outsiderId, async () => {
        await assert.rejects(
          database.query("insert into public.community_members (community_id, student_id) values ($1, $2)", [studyGroup.id, adminId]),
          isCode("42501"),
        );
        await assert.rejects(
          database.query("insert into public.community_follows (community_id, student_id) values ($1, $2)", [studyGroup.id, adminId]),
          isCode("42501"),
        );
        const left = await database.query("delete from public.community_members where student_id = $1", [memberId]);
        assert.equal(left.affectedRows, 0);
        const unfollowed = await database.query("delete from public.community_follows where student_id = $1", [memberId]);
        assert.equal(unfollowed.affectedRows, 0);
      });
    });

    it("cannot make anyone an owner by joining", async () => {
      await asUser(database, outsiderId, async () => {
        await assert.rejects(
          database.query("insert into public.community_members (community_id, student_id, role) values ($1, $2, 'owner')", [studyGroup.id, outsiderId]),
          isCode("42501"),
        );
      });
    });

    it("follows without joining, and unfollows while staying a member", async () => {
      await asUser(database, outsiderId, () =>
        database.query("insert into public.community_follows (community_id, student_id) values ($1, $2)", [studyGroup.id, outsiderId]),
      );
      assert.equal(
        (await rows(database, "select 1 from public.community_members where community_id = $1 and student_id = $2", [studyGroup.id, outsiderId])).length,
        0,
      );

      await asUser(database, memberId, () =>
        database.query("delete from public.community_follows where community_id = $1 and student_id = $2", [studyGroup.id, memberId]),
      );
      assert.equal(
        (await rows(database, "select 1 from public.community_members where community_id = $1 and student_id = $2", [studyGroup.id, memberId])).length,
        1,
      );
      // Joining again changes nothing, and does not re-follow.
      await asUser(database, memberId, () => database.query("select public.join_community($1)", [studyGroup.id]));
      assert.equal(
        (await rows(database, "select 1 from public.community_follows where community_id = $1 and student_id = $2", [studyGroup.id, memberId])).length,
        0,
      );
    });

    it("never lets the owner leave", async () => {
      await asUser(database, ownerId, async () => {
        await assert.rejects(database.query("select public.leave_community($1)", [studyGroup.id]), isCode("CM012"));
        const deleted = await database.query(
          "delete from public.community_members where community_id = $1 and student_id = $2",
          [studyGroup.id, ownerId],
        );
        assert.equal(deleted.affectedRows, 0);
      });
    });

    it("leaving ends both membership and follow", async () => {
      const temp = await createCommunity(database, ownerId, "Temporary club");
      await asUser(database, outsiderId, async () => {
        await database.query("select public.join_community($1)", [temp.id]);
        await database.query("select public.leave_community($1)", [temp.id]);
        await assert.rejects(database.query("select public.leave_community($1)", [temp.id]), isCode("CM011"));
      });
      assert.equal(
        (await rows(database, "select 1 from public.community_members where community_id = $1 and student_id = $2", [temp.id, outsiderId])).length,
        0,
      );
      assert.equal(
        (await rows(database, "select 1 from public.community_follows where community_id = $1 and student_id = $2", [temp.id, outsiderId])).length,
        0,
      );
    });

    it("counts members and followers in the overview", async () => {
      const [overview] = await asUser(database, outsiderId, () =>
        rows(database, "select member_count, follower_count from public.community_overview where id = $1", [studyGroup.id]),
      );
      // Owner and member; owner and outsider follow (the member unfollowed).
      assert.deepEqual(overview, { member_count: 2, follower_count: 2 });
    });
  });

  describe("posting", () => {
    let postId;

    it("lets a member post, through the normal posts path", async () => {
      postId = await postIn(database, memberId, studyGroup.id);
      const [post] = await rows(database, "select author_id, category, status from public.posts where id = $1", [postId]);
      assert.deepEqual(post, { author_id: memberId, category: "Academics", status: "published" });
      const feed = await asUser(database, outsiderId, () =>
        rows(database, "select id, community_slug, upvote_count, comment_count from public.community_post_feed where community_id = $1", [studyGroup.id]),
      );
      assert.deepEqual(feed, [{ id: postId, community_slug: "cmps-271-study-group", upvote_count: 0, comment_count: 0 }]);
      const [overview] = await asUser(database, outsiderId, () =>
        rows(database, "select last_post_at is not null as has_post from public.community_overview where id = $1", [studyGroup.id]),
      );
      assert.equal(overview.has_post, true);
    });

    it("refuses a non-member, a SkillSwap category and a suspended member", async () => {
      await assert.rejects(postIn(database, outsiderId, studyGroup.id), isCode("CM011"));
      await assert.rejects(postIn(database, memberId, studyGroup.id, "Swap", "SkillSwap"), isCode("22023"));
      await assert.rejects(postIn(database, memberId, studyGroup.id, "Unknown", "Nope"), isCode("22023"));

      // A suspended student cannot even join; add them directly to prove posting refuses them too.
      await assert.rejects(
        asUser(database, suspendedId, () => database.query("select public.join_community($1)", [studyGroup.id])),
        isCode("42501"),
      );
      await database.query("insert into public.community_members (community_id, student_id) values ($1, $2)", [studyGroup.id, suspendedId]);
      await assert.rejects(postIn(database, suspendedId, studyGroup.id), isCode("42501"));
    });

    it("takes a deleted post out of its community", async () => {
      const doomed = await postIn(database, memberId, studyGroup.id, "Wrong room");
      await asUser(database, memberId, () => database.query("update public.posts set status = 'deleted' where id = $1", [doomed]));
      assert.equal((await rows(database, "select 1 from public.community_posts where post_id = $1", [doomed])).length, 0);

      const purged = await postIn(database, memberId, studyGroup.id, "Purged with its account");
      await database.query("delete from public.posts where id = $1", [purged]);
      assert.equal((await rows(database, "select 1 from public.community_posts where post_id = $1", [purged])).length, 0);
    });

    it("drops a moderator-removed post from the community like everywhere else", async () => {
      const reported = await postIn(database, memberId, studyGroup.id, "Reported in the community");
      await asUser(database, outsiderId, () =>
        database.query("insert into public.content_reports (reporter_id, post_id, reason) values ($1, $2, 'spam')", [outsiderId, reported]),
      );
      await asUser(database, moderatorId, () =>
        database.query("select public.moderate_reported_content('post', $1, 'remove', 'Breaks the rules')", [reported]),
      );
      const ids = await asUser(database, outsiderId, () =>
        rows(database, "select id from public.community_post_feed where community_id = $1", [studyGroup.id]),
      );
      assert.deepEqual(ids.map((row) => row.id), [postId]);
    });
  });

  describe("editing and archiving", () => {
    it("lets the owner edit only the name, description and topic", async () => {
      await asUser(database, ownerId, async () => {
        const edited = await database.query(
          "update public.communities set name = 'CMPS 271 study crew', description = 'Reviews.' where id = $1",
          [studyGroup.id],
        );
        assert.equal(edited.affectedRows, 1);
        await assert.rejects(
          database.query("update public.communities set status = 'archived', archived_at = now() where id = $1", [studyGroup.id]),
          isCode("42501"),
        );
        await assert.rejects(
          database.query("update public.communities set owner_id = $2 where id = $1", [studyGroup.id, memberId]),
          isCode("42501"),
        );
      });
      const [community] = await rows(database, "select name, slug from public.communities where id = $1", [studyGroup.id]);
      // The address stays the same when the name changes.
      assert.deepEqual(community, { name: "CMPS 271 study crew", slug: "cmps-271-study-group" });
    });

    it("never lets another student edit or archive my community", async () => {
      await asUser(database, memberId, async () => {
        const edited = await database.query("update public.communities set name = 'Hijacked' where id = $1", [studyGroup.id]);
        assert.equal(edited.affectedRows, 0);
        await assert.rejects(database.query("select public.archive_community($1)", [studyGroup.id]), isCode("42501"));
      });
    });

    it("lets a moderator archive it, and the audit log records it", async () => {
      await asUser(database, moderatorId, () => database.query("select public.archive_community($1)", [studyGroup.id]));
      const [community] = await rows(
        database,
        "select status, archived_by, archived_at is not null as dated from public.communities where id = $1",
        [studyGroup.id],
      );
      assert.deepEqual(community, { status: "archived", archived_by: moderatorId, dated: true });
      const audit = await asUser(database, adminId, () =>
        rows(database, "select actor_id, action, target_type, metadata from public.audit_log where target_id = $1", [studyGroup.id]),
      );
      assert.deepEqual(audit, [{ actor_id: moderatorId, action: "community.archived", target_type: "community", metadata: { as: "moderator" } }]);
    });

    it("keeps an archived community readable and closes it to everything else", async () => {
      const readable = await asUser(database, outsiderId, () =>
        rows(database, "select status from public.community_overview where id = $1", [studyGroup.id]),
      );
      assert.deepEqual(readable, [{ status: "archived" }]);
      assert.equal(
        (await asUser(database, outsiderId, () => rows(database, "select 1 from public.community_post_feed where community_id = $1", [studyGroup.id]))).length,
        1,
      );

      await asUser(database, adminId, async () => {
        await assert.rejects(database.query("select public.join_community($1)", [studyGroup.id]), isCode("CM010"));
        await assert.rejects(
          database.query("insert into public.community_follows (community_id, student_id) values ($1, $2)", [studyGroup.id, adminId]),
          isCode("42501"),
        );
      });
      await assert.rejects(postIn(database, memberId, studyGroup.id, "After archiving"), isCode("CM010"));
      await asUser(database, memberId, async () => {
        await assert.rejects(database.query("select public.leave_community($1)", [studyGroup.id]), isCode("CM010"));
      });
      await asUser(database, outsiderId, async () => {
        const unfollowed = await database.query(
          "delete from public.community_follows where community_id = $1 and student_id = $2",
          [studyGroup.id, outsiderId],
        );
        assert.equal(unfollowed.affectedRows, 0);
      });
      await asUser(database, ownerId, async () => {
        const edited = await database.query("update public.communities set name = 'Revived' where id = $1", [studyGroup.id]);
        assert.equal(edited.affectedRows, 0);
        await assert.rejects(database.query("select public.archive_community($1)", [studyGroup.id]), isCode("CM010"));
      });
    });

    it("frees an archived community's name, under a new address", async () => {
      const again = await createCommunity(database, moderatorId, "CMPS 271 Study Crew", { topic: "course", courseId: cmps271 });
      assert.equal(again.slug, "cmps-271-study-crew");
    });

    it("lets the owner archive their own community, recorded as the owner", async () => {
      const own = await createCommunity(database, memberId, "Archive me");
      await asUser(database, memberId, () => database.query("select public.archive_community($1)", [own.id]));
      const audit = await asUser(database, adminId, () =>
        rows(database, "select actor_id, metadata from public.audit_log where target_id = $1", [own.id]),
      );
      assert.deepEqual(audit, [{ actor_id: memberId, metadata: { as: "owner" } }]);
    });
  });
});
