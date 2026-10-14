import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Pins depend on how posts are soft-deleted, so the posts migrations load
// first, in the order they run on Supabase.
const migrationFiles = [
  "20261010130000_create_posts.sql",
  "20261010150000_allow_post_editing.sql",
  "20261010160000_fix_post_editing_permissions.sql",
  "20261011130000_allow_post_deletion.sql",
  "20261011140000_fix_post_deletion_rls.sql",
  "20261011160000_fix_deleted_post_visibility.sql",
  "20261014100000_create_profiles.sql",
];

const migrations = await Promise.all(
  migrationFiles.map((file) =>
    readFile(
      new URL(`../../supabase/migrations/${file}`, import.meta.url),
      "utf8",
    ),
  ),
);

const studentId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const newcomerId = "00000000-0000-4000-8000-000000000003";
const blankNameId = "00000000-0000-4000-8000-000000000004";
const longNameId = "00000000-0000-4000-8000-000000000005";

// Supabase grants anon and authenticated every privilege on new tables and
// functions by default. Reproduce that, so the tests prove the migration's
// revokes and column grants rather than an empty starting point.
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

  insert into auth.users (id, email, raw_user_meta_data) values
    ('${studentId}', 'student@mail.aub.edu', '{"full_name": "  Test   Student  "}'),
    ('${otherId}', 'other@mail.aub.edu', null);
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

async function createPost(database, authorId, title) {
  const { rows } = await database.query(
    `insert into public.posts (author_id, title, body, category)
     values ($1, $2, 'Body', 'General')
     returning id`,
    [authorId, title],
  );

  return rows[0].id;
}

async function pinnedPostOf(database, userId) {
  const { rows } = await database.query(
    "select pinned_post_id from public.profiles where id = $1",
    [userId],
  );

  return rows[0].pinned_post_id;
}

const isCode = (code) => (error) => error.code === code;

describe("SP2-60 profile data storage", () => {
  let database;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);

    for (const migration of migrations) {
      await database.exec(migration);
    }
  });

  after(async () => {
    await database?.close();
  });

  it("backfills accounts that existed before the migration", async () => {
    const { rows } = await database.query(
      "select id, full_name from public.profiles order by id",
    );

    assert.deepEqual(rows, [
      { id: studentId, full_name: "Test Student" },
      { id: otherId, full_name: "other" },
    ]);
  });

  it("creates a profile at sign-up from the registration name", async () => {
    await database.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'newcomer@mail.aub.edu', '{"full_name": "Nour Haddad"}')`,
      [newcomerId],
    );

    const { rows } = await database.query(
      `select full_name, major, graduation_year, bio, interests, pinned_post_id
       from public.profiles where id = $1`,
      [newcomerId],
    );

    assert.deepEqual(rows, [{
      full_name: "Nour Haddad",
      major: null,
      graduation_year: null,
      bio: null,
      interests: [],
      pinned_post_id: null,
    }]);
  });

  it("falls back to the email's local part and keeps long names within 100 characters", async () => {
    await database.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
         ($1, 'blank.name@mail.aub.edu', '{"full_name": "   "}'),
         ($2, 'long@mail.aub.edu', jsonb_build_object('full_name', repeat('a', 150)))`,
      [blankNameId, longNameId],
    );

    const { rows } = await database.query(
      `select id, full_name from public.profiles
       where id in ($1, $2) order by id`,
      [blankNameId, longNameId],
    );

    assert.deepEqual(rows, [
      { id: blankNameId, full_name: "blank.name" },
      { id: longNameId, full_name: "a".repeat(100) },
    ]);
  });

  it("lets another signed-in student read a profile", async () => {
    await asUser(database, otherId, async () => {
      const { rows } = await database.query(
        "select full_name from public.profiles where id = $1",
        [studentId],
      );

      assert.deepEqual(rows, [{ full_name: "Test Student" }]);
    });
  });

  it("keeps profiles away from signed-out visitors", async () => {
    await database.exec("set role anon");

    try {
      await assert.rejects(
        database.query("select * from public.profiles"),
        isCode("42501"),
      );
    } finally {
      await database.exec("reset role");
    }
  });

  it("does not let another student update a profile", async () => {
    await asUser(database, otherId, async () => {
      const { affectedRows } = await database.query(
        "update public.profiles set bio = 'Hijacked' where id = $1",
        [studentId],
      );

      assert.equal(affectedRows, 0);
    });

    const { rows } = await database.query(
      "select bio from public.profiles where id = $1",
      [studentId],
    );

    assert.equal(rows[0].bio, null);
  });

  it("lets the owner edit their profile and keeps updated_at current", async () => {
    const { rows: [before] } = await database.query(
      "select updated_at from public.profiles where id = $1",
      [studentId],
    );

    await asUser(database, studentId, async () => {
      await database.query(
        `update public.profiles
         set full_name = 'Test S.', major = 'Computer Science',
             graduation_year = 2027, bio = 'Hello',
             interests = array['Chess', 'Python']
         where id = $1`,
        [studentId],
      );
    });

    const { rows: [after] } = await database.query(
      `select full_name, major, graduation_year, bio, interests, updated_at
       from public.profiles where id = $1`,
      [studentId],
    );

    assert.equal(after.full_name, "Test S.");
    assert.equal(after.major, "Computer Science");
    assert.equal(after.graduation_year, 2027);
    assert.equal(after.bio, "Hello");
    assert.deepEqual(after.interests, ["Chess", "Python"]);
    assert.ok(after.updated_at > before.updated_at);
  });

  it("protects the id and timestamps from the owner", async () => {
    await asUser(database, studentId, async () => {
      for (const assignment of [
        `id = '${newcomerId}'`,
        "created_at = now()",
        "updated_at = now()",
      ]) {
        await assert.rejects(
          database.query(
            `update public.profiles set ${assignment} where id = $1`,
            [studentId],
          ),
          isCode("42501"),
          assignment,
        );
      }
    });
  });

  it("does not let clients create or delete profiles", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query(
          "insert into public.profiles (id, full_name) values ($1, 'Copy')",
          [studentId],
        ),
        isCode("42501"),
      );

      await assert.rejects(
        database.query("delete from public.profiles where id = $1", [studentId]),
        isCode("42501"),
      );
    });
  });

  it("rejects values outside the allowed lengths and ranges", async () => {
    const invalid = [
      "full_name = '   '",
      `full_name = '${"x".repeat(101)}'`,
      `major = '${"x".repeat(101)}'`,
      "graduation_year = 2019",
      "graduation_year = 2036",
      `bio = '${"x".repeat(501)}'`,
      "interests = array['a','b','c','d','e','f','g','h','i','j','k']",
      `interests = array['${"x".repeat(41)}']`,
      "interests = array['  ']",
    ];

    await asUser(database, studentId, async () => {
      for (const assignment of invalid) {
        await assert.rejects(
          database.query(
            `update public.profiles set ${assignment} where id = $1`,
            [studentId],
          ),
          isCode("23514"),
          assignment,
        );
      }
    });
  });

  describe("SP2-11 pinning", () => {
    let firstPostId;
    let secondPostId;
    let othersPostId;

    before(async () => {
      firstPostId = await createPost(database, studentId, "First");
      secondPostId = await createPost(database, studentId, "Second");
      othersPostId = await createPost(database, otherId, "Someone else's");
    });

    it("pins one of the owner's published posts, and a new pin replaces it", async () => {
      await asUser(database, studentId, async () => {
        await database.query(
          "update public.profiles set pinned_post_id = $1 where id = $2",
          [firstPostId, studentId],
        );
        assert.equal(await pinnedPostOf(database, studentId), firstPostId);

        await database.query(
          "update public.profiles set pinned_post_id = $1 where id = $2",
          [secondPostId, studentId],
        );
        assert.equal(await pinnedPostOf(database, studentId), secondPostId);
      });
    });

    it("rejects pinning another student's post or a post that does not exist", async () => {
      await asUser(database, studentId, async () => {
        for (const postId of [othersPostId, "00000000-0000-4000-8000-0000000000ff"]) {
          await assert.rejects(
            database.query(
              "update public.profiles set pinned_post_id = $1 where id = $2",
              [postId, studentId],
            ),
            (error) =>
              error.code === "23514" &&
              error.message === "Only a published post you wrote can be pinned",
          );
        }
      });

      assert.equal(await pinnedPostOf(database, studentId), secondPostId);
    });

    it("keeps the pin when the owner edits other fields", async () => {
      await asUser(database, studentId, async () => {
        await database.query(
          "update public.profiles set bio = 'Still pinned' where id = $1",
          [studentId],
        );
      });

      assert.equal(await pinnedPostOf(database, studentId), secondPostId);
    });

    it("clears the pin when the owner deletes the pinned post", async () => {
      await asUser(database, studentId, async () => {
        await database.query(
          "update public.posts set status = 'deleted' where id = $1",
          [secondPostId],
        );
      });

      assert.equal(await pinnedPostOf(database, studentId), null);
    });

    it("rejects pinning a deleted post", async () => {
      await asUser(database, studentId, async () => {
        await assert.rejects(
          database.query(
            "update public.profiles set pinned_post_id = $1 where id = $2",
            [secondPostId, studentId],
          ),
          isCode("23514"),
        );
      });
    });

    it("unpins", async () => {
      await asUser(database, studentId, async () => {
        await database.query(
          "update public.profiles set pinned_post_id = $1 where id = $2",
          [firstPostId, studentId],
        );
        await database.query(
          "update public.profiles set pinned_post_id = null where id = $1",
          [studentId],
        );
      });

      assert.equal(await pinnedPostOf(database, studentId), null);
    });

    it("clears the pin when someone other than the owner unpublishes the post", async () => {
      await asUser(database, studentId, async () => {
        await database.query(
          "update public.profiles set pinned_post_id = $1 where id = $2",
          [firstPostId, studentId],
        );
      });

      // A moderator's removal runs outside the author's RLS; the pin must
      // still go, even though that person cannot update this profile.
      await database.query(
        "update public.posts set status = 'deleted' where id = $1",
        [firstPostId],
      );

      assert.equal(await pinnedPostOf(database, studentId), null);
    });

    it("clears the pin when the post row is removed outright", async () => {
      const postId = await createPost(database, otherId, "Short-lived");

      await asUser(database, otherId, async () => {
        await database.query(
          "update public.profiles set pinned_post_id = $1 where id = $2",
          [postId, otherId],
        );
      });

      await database.query("delete from public.posts where id = $1", [postId]);

      assert.equal(await pinnedPostOf(database, otherId), null);
    });
  });
});
