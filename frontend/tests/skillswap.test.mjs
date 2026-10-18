import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// SkillSwap posts are posts, so the posts migrations load first, in the
// order they run on Supabase.
const migrationFiles = [
  "20261010130000_create_posts.sql",
  "20261010140000_create_categories.sql",
  "20261010150000_allow_post_editing.sql",
  "20261010160000_fix_post_editing_permissions.sql",
  "20261011130000_allow_post_deletion.sql",
  "20261011140000_fix_post_deletion_rls.sql",
  "20261011160000_fix_deleted_post_visibility.sql",
  "20261018200000_create_skillswap.sql",
];

const migrations = await Promise.all(
  migrationFiles.map((file) =>
    readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"),
  ),
);

const studentId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";

// Supabase grants anon and authenticated every privilege on new tables and
// functions by default. Reproduce that, so the tests prove the migration's
// revokes rather than an empty starting point.
const foundation = `
  create role anon;
  create role authenticated;
  create role service_role;
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

  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;

  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;

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

async function createSkillSwap(database, userId, fields = {}) {
  const values = {
    can_teach: "Python for CMPS 200",
    wants_to_learn: "Conversational French",
    meeting_method: "either",
    availability: null,
    details: null,
    ...fields,
  };

  return asUser(database, userId, async () => {
    const { rows } = await database.query(
      "select public.create_skillswap_post($1, $2, $3, $4, $5) as id",
      [values.can_teach, values.wants_to_learn, values.meeting_method, values.availability, values.details],
    );
    return rows[0].id;
  });
}

async function postOf(database, postId) {
  const { rows } = await database.query(
    "select title, body, category, status, edited_at from public.posts where id = $1",
    [postId],
  );
  return rows[0];
}

const isCode = (code) => (error) => error.code === code;

describe("SP2-53 SkillSwap post template", () => {
  let database;
  let postId;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);

    for (const migration of migrations) {
      await database.exec(migration);
    }

    postId = await createSkillSwap(database, studentId, {
      can_teach: "  Python for CMPS 200 ",
      wants_to_learn: "Conversational\nFrench",
      meeting_method: "in_person",
      availability: " Weekday evenings ",
      details: "Happy to meet in Jafet.",
    });
  });

  after(async () => {
    await database?.close();
  });

  it("adds the SkillSwap category once", async () => {
    await database.exec(migrations.at(-1).split("create table")[0] + "commit;");

    const { rows } = await database.query(
      "select count(*)::int as count from public.categories where name = 'SkillSwap'",
    );
    assert.equal(rows[0].count, 1);
  });

  it("creates the post and its details together, with the built title and body", async () => {
    const post = await postOf(database, postId);

    assert.equal(post.category, "SkillSwap");
    assert.equal(post.status, "published");
    assert.equal(post.title, "Can teach: Python for CMPS 200 · Wants to learn: Conversational French");
    assert.equal(
      post.body,
      [
        "Can teach: Python for CMPS 200",
        "",
        "Wants to learn: Conversational\nFrench",
        "",
        "Meeting: In person",
        "Availability: Weekday evenings",
        "",
        "Happy to meet in Jafet.",
      ].join("\n"),
    );

    const { rows } = await database.query(
      `select can_teach, wants_to_learn, meeting_method, availability, details
       from public.post_skillswap where post_id = $1`,
      [postId],
    );
    assert.deepEqual(rows, [{
      can_teach: "Python for CMPS 200",
      wants_to_learn: "Conversational\nFrench",
      meeting_method: "in_person",
      availability: "Weekday evenings",
      details: "Happy to meet in Jafet.",
    }]);
  });

  it("leaves out empty availability and details, and names each meeting method", async () => {
    const { rows } = await database.query(
      `select m, (public.skillswap_post_text('A', 'B', m, '  ', '')).body as body
       from unnest(array['online', 'in_person', 'either']) as m`,
    );

    assert.deepEqual(rows.map((row) => row.body), [
      "Can teach: A\n\nWants to learn: B\n\nMeeting: Online",
      "Can teach: A\n\nWants to learn: B\n\nMeeting: In person",
      "Can teach: A\n\nWants to learn: B\n\nMeeting: Online or in person",
    ]);
  });

  it("shares the title's 200 characters between two long boxes", async () => {
    const { rows } = await database.query(
      "select (public.skillswap_post_text($1, $2, 'either')).title as title",
      ["t".repeat(300), "l".repeat(300)],
    );
    const { title } = rows[0];

    assert.equal(title.length, 200);
    assert.match(title, /^Can teach: t{84}… · Wants to learn: l{84}…$/);
  });

  it("gives a short box's spare room to the other one", async () => {
    const { rows } = await database.query(
      "select (public.skillswap_post_text($1, 'Chess', 'either')).title as title",
      ["t".repeat(300)],
    );
    const { title } = rows[0];

    assert.ok(title.length <= 200);
    assert.ok(title.endsWith(" · Wants to learn: Chess"));
    assert.ok(title.startsWith(`Can teach: ${"t".repeat(160)}`));
  });

  it("lets another student read a published SkillSwap post and its details", async () => {
    await asUser(database, otherId, async () => {
      const { rows } = await database.query(
        "select can_teach from public.post_skillswap where post_id = $1",
        [postId],
      );
      assert.deepEqual(rows, [{ can_teach: "Python for CMPS 200" }]);
    });
  });

  it("does not let another student edit the details", async () => {
    await asUser(database, otherId, async () => {
      const { affectedRows } = await database.query(
        "update public.post_skillswap set can_teach = 'Hijacked' where post_id = $1",
        [postId],
      );
      assert.equal(affectedRows, 0);

      await assert.rejects(
        database.query("select public.update_skillswap_post($1, 'X', 'Y', 'online', null, null)", [postId]),
        isCode("P0002"),
      );
    });

    const { rows } = await database.query(
      "select can_teach from public.post_skillswap where post_id = $1",
      [postId],
    );
    assert.equal(rows[0].can_teach, "Python for CMPS 200");
  });

  it("lets the author edit through the template, which marks the post edited", async () => {
    await asUser(database, studentId, async () => {
      await database.query(
        "select public.update_skillswap_post($1, 'Python and SQL', 'French', 'online', null, null)",
        [postId],
      );
    });

    const post = await postOf(database, postId);
    assert.equal(post.title, "Can teach: Python and SQL · Wants to learn: French");
    assert.equal(post.body, "Can teach: Python and SQL\n\nWants to learn: French\n\nMeeting: Online");
    assert.notEqual(post.edited_at, null);

    const { rows } = await database.query(
      "select meeting_method, availability, details from public.post_skillswap where post_id = $1",
      [postId],
    );
    assert.deepEqual(rows, [{ meeting_method: "online", availability: null, details: null }]);
  });

  it("does not attach details to someone else's post or to a normal post", async () => {
    const { rows } = await database.query(
      `insert into public.posts (author_id, title, body, category)
       values ($1, 'A normal post', 'Body', 'General') returning id`,
      [studentId],
    );
    const normalPost = rows[0].id;

    for (const [userId, target] of [[otherId, postId], [studentId, normalPost]]) {
      await asUser(database, userId, async () => {
        await assert.rejects(
          database.query(
            "insert into public.post_skillswap (post_id, can_teach, wants_to_learn) values ($1, 'A', 'B')",
            [target],
          ),
          isCode("42501"),
        );
      });
    }
  });

  it("never lets a client delete details", async () => {
    await asUser(database, studentId, async () => {
      await assert.rejects(
        database.query("delete from public.post_skillswap where post_id = $1", [postId]),
        isCode("42501"),
      );
    });
  });

  it("keeps everything away from signed-out visitors", async () => {
    await database.exec("set role anon");

    try {
      await assert.rejects(database.query("select * from public.post_skillswap"), isCode("42501"));
      await assert.rejects(
        database.query("select public.create_skillswap_post('A', 'B')"),
        isCode("42501"),
      );
    } finally {
      await database.exec("reset role");
    }
  });

  describe("category lock", () => {
    it("does not let a SkillSwap post leave its category", async () => {
      await asUser(database, studentId, async () => {
        await assert.rejects(
          database.query("update public.posts set category = 'General' where id = $1", [postId]),
          isCode("23514"),
        );
      });
    });

    it("does not let a normal post become a SkillSwap post", async () => {
      const { rows } = await database.query(
        `insert into public.posts (author_id, title, body, category)
         values ($1, 'Another post', 'Body', 'Academics') returning id`,
        [studentId],
      );

      await asUser(database, studentId, async () => {
        await assert.rejects(
          database.query("update public.posts set category = 'SkillSwap' where id = $1", [rows[0].id]),
          isCode("23514"),
        );
      });
    });

    it("still allows a normal edit that keeps the category", async () => {
      await asUser(database, studentId, async () => {
        const { affectedRows } = await database.query(
          "update public.posts set category = 'SkillSwap', edited_at = now() where id = $1",
          [postId],
        );
        assert.equal(affectedRows, 1);
      });
    });
  });

  describe("checks", () => {
    const invalid = [
      ["an empty 'can teach' box", { can_teach: "   " }],
      ["an empty 'wants to learn' box", { wants_to_learn: "\n" }],
      ["a 301-character 'can teach' box", { can_teach: "x".repeat(301) }],
      ["a 301-character 'wants to learn' box", { wants_to_learn: "x".repeat(301) }],
      ["121 characters of availability", { availability: "x".repeat(121) }],
      ["2001 characters of extra details", { details: "x".repeat(2001) }],
      ["an unknown meeting method", { meeting_method: "carrier pigeon" }],
    ];

    for (const [label, fields] of invalid) {
      it(`rejects ${label}`, async () => {
        await assert.rejects(createSkillSwap(database, studentId, fields), isCode("23514"), label);
      });
    }

    it("accepts the longest allowed values", async () => {
      const id = await createSkillSwap(database, studentId, {
        can_teach: "t".repeat(300),
        wants_to_learn: "l".repeat(300),
        availability: "a".repeat(120),
        details: "d".repeat(2000),
      });
      const post = await postOf(database, id);

      assert.ok(post.title.length <= 200);
      assert.ok(post.body.length <= 10000);
    });
  });

  describe("deleting the post", () => {
    it("hides its details from other students but not from the author", async () => {
      await asUser(database, studentId, async () => {
        await database.query("update public.posts set status = 'deleted' where id = $1", [postId]);
      });

      await asUser(database, otherId, async () => {
        const { rows } = await database.query(
          "select post_id from public.post_skillswap where post_id = $1",
          [postId],
        );
        assert.deepEqual(rows, []);
      });

      await asUser(database, studentId, async () => {
        const { rows } = await database.query(
          "select post_id from public.post_skillswap where post_id = $1",
          [postId],
        );
        assert.equal(rows.length, 1);
      });
    });

    it("cannot be edited afterwards", async () => {
      await asUser(database, studentId, async () => {
        await assert.rejects(
          database.query("select public.update_skillswap_post($1, 'A', 'B', 'online', null, null)", [postId]),
          isCode("P0002"),
        );
        const { affectedRows } = await database.query(
          "update public.post_skillswap set can_teach = 'Late edit' where post_id = $1",
          [postId],
        );
        assert.equal(affectedRows, 0);
      });
    });
  });
});
