import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Conversations reference profiles, which reference posts (pins), so those
// migrations load first, in the order they run on Supabase.
const migrationFiles = [
  "20261010130000_create_posts.sql",
  "20261010150000_allow_post_editing.sql",
  "20261010160000_fix_post_editing_permissions.sql",
  "20261011130000_allow_post_deletion.sql",
  "20261011140000_fix_post_deletion_rls.sql",
  "20261011160000_fix_deleted_post_visibility.sql",
  "20261014100000_create_profiles.sql",
  "20261018160000_create_messaging.sql",
];

const migrations = await Promise.all(
  migrationFiles.map((file) =>
    readFile(
      new URL(`../../supabase/migrations/${file}`, import.meta.url),
      "utf8",
    ),
  ),
);

// Ids chosen so the pair order is not the order the students act in: Bea's id
// sorts before Ali's.
const ali = "00000000-0000-4000-8000-0000000000b2";
const bea = "00000000-0000-4000-8000-0000000000b1";
const cam = "00000000-0000-4000-8000-0000000000b3";
const dee = "00000000-0000-4000-8000-0000000000b4";
const nobody = "00000000-0000-4000-8000-0000000000ff";

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
    ('${cam}', 'cam@mail.aub.edu', '{"full_name": "Cam Saad"}'),
    ('${dee}', 'dee@mail.aub.edu', '{"full_name": "Dee Nasr"}');
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

async function startConversation(database, userId, otherId) {
  return asUser(database, userId, async () => {
    const { rows } = await database.query(
      "select public.start_conversation($1) as id",
      [otherId],
    );
    return rows[0].id;
  });
}

async function send(database, userId, conversationId, body) {
  return asUser(database, userId, async () => {
    const { rows } = await database.query(
      `insert into public.messages (conversation_id, sender_id, body)
       values ($1, $2, $3)
       returning id, created_at`,
      [conversationId, userId, body],
    );
    return rows[0];
  });
}

async function inboxOf(database, userId) {
  return asUser(database, userId, async () => {
    const { rows } = await database.query(
      "select * from public.list_my_conversations()",
    );
    return rows;
  });
}

async function unreadCountOf(database, userId) {
  return asUser(database, userId, async () => {
    const { rows } = await database.query(
      "select public.count_my_unread_conversations() as count",
    );
    return rows[0].count;
  });
}

async function markRead(database, userId, conversationId) {
  await asUser(database, userId, async () => {
    await database.query(
      `update public.conversation_reads
       set last_read_at = now()
       where conversation_id = $1 and user_id = $2`,
      [conversationId, userId],
    );
  });
}

const isCode = (code) => (error) => error.code === code;

describe("SP2-36 conversation data storage", () => {
  let database;
  let conversationId;

  before(async () => {
    database = new PGlite();
    await database.exec(foundation);

    for (const migration of migrations) {
      await database.exec(migration);
    }

    conversationId = await startConversation(database, ali, bea);
  });

  after(async () => {
    await database?.close();
  });

  describe("start_conversation", () => {
    it("stores the pair in a fixed order, whichever student starts", async () => {
      const { rows } = await database.query(
        "select student_a, student_b from public.conversations where id = $1",
        [conversationId],
      );

      assert.deepEqual(rows, [{ student_a: bea, student_b: ali }]);
    });

    it("returns the same conversation when either student starts it again", async () => {
      assert.equal(await startConversation(database, ali, bea), conversationId);
      assert.equal(await startConversation(database, bea, ali), conversationId);

      const { rows } = await database.query(
        "select count(*)::int as count from public.conversations",
      );
      assert.equal(rows[0].count, 1);
    });

    it("gives each participant one read-state row", async () => {
      const { rows } = await database.query(
        `select user_id from public.conversation_reads
         where conversation_id = $1 order by user_id`,
        [conversationId],
      );

      assert.deepEqual(rows.map((row) => row.user_id), [bea, ali]);
    });

    it("rejects a conversation with yourself", async () => {
      await assert.rejects(startConversation(database, ali, ali), isCode("22023"));
    });

    it("rejects a student who does not exist", async () => {
      await assert.rejects(startConversation(database, ali, nobody), isCode("P0002"));
    });

    it("is not callable by signed-out visitors", async () => {
      await database.exec("set role anon");

      try {
        await assert.rejects(
          database.query("select public.start_conversation($1)", [bea]),
          isCode("42501"),
        );
      } finally {
        await database.exec("reset role");
      }
    });

    it("leaves the pair rules to the database even outside the function", async () => {
      // Reversed order breaks the check; a repeated pair breaks the unique key.
      await assert.rejects(
        database.query(
          "insert into public.conversations (student_a, student_b) values ($1, $2)",
          [ali, bea],
        ),
        isCode("23514"),
      );
      await assert.rejects(
        database.query(
          "insert into public.conversations (student_a, student_b) values ($1, $2)",
          [bea, ali],
        ),
        isCode("23505"),
      );
    });

    it("does not let students create conversations directly", async () => {
      await asUser(database, cam, async () => {
        await assert.rejects(
          database.query(
            "insert into public.conversations (student_a, student_b) values ($1, $2)",
            [cam, dee],
          ),
          isCode("42501"),
        );
      });
    });
  });

  describe("messages", () => {
    let firstMessage;

    before(async () => {
      firstMessage = await send(database, ali, conversationId, "Hi Bea!");
    });

    it("lets both participants read the conversation and its messages", async () => {
      for (const userId of [ali, bea]) {
        await asUser(database, userId, async () => {
          const { rows: conversations } = await database.query(
            "select id from public.conversations",
          );
          const { rows: messages } = await database.query(
            "select body, sender_id from public.messages",
          );

          assert.deepEqual(conversations, [{ id: conversationId }]);
          assert.deepEqual(messages, [{ body: "Hi Bea!", sender_id: ali }]);
        });
      }
    });

    it("hides the conversation and its messages from a third student", async () => {
      await asUser(database, cam, async () => {
        const { rows: conversations } = await database.query(
          "select id from public.conversations",
        );
        const { rows: messages } = await database.query(
          "select id from public.messages",
        );
        const { rows: reads } = await database.query(
          "select * from public.conversation_reads",
        );

        assert.deepEqual(conversations, []);
        assert.deepEqual(messages, []);
        assert.deepEqual(reads, []);
      });
    });

    it("keeps everything away from signed-out visitors", async () => {
      await database.exec("set role anon");

      try {
        for (const table of ["conversations", "conversation_reads", "messages"]) {
          await assert.rejects(
            database.query(`select * from public.${table}`),
            isCode("42501"),
            table,
          );
        }
      } finally {
        await database.exec("reset role");
      }
    });

    it("lets a participant send only as themselves", async () => {
      await asUser(database, bea, async () => {
        await assert.rejects(
          database.query(
            `insert into public.messages (conversation_id, sender_id, body)
             values ($1, $2, 'Pretending to be Ali')`,
            [conversationId, ali],
          ),
          isCode("42501"),
        );
      });

      await send(database, bea, conversationId, "Hey Ali");
    });

    it("does not let a third student send into the conversation", async () => {
      await asUser(database, cam, async () => {
        await assert.rejects(
          database.query(
            `insert into public.messages (conversation_id, sender_id, body)
             values ($1, $2, 'Let me in')`,
            [conversationId, cam],
          ),
          isCode("42501"),
        );
      });
    });

    it("does not let clients choose a message's id or time", async () => {
      await asUser(database, ali, async () => {
        await assert.rejects(
          database.query(
            `insert into public.messages (conversation_id, sender_id, body, created_at)
             values ($1, $2, 'Backdated', '2020-01-01')`,
            [conversationId, ali],
          ),
          isCode("42501"),
        );
      });
    });

    it("never lets a message be edited or deleted", async () => {
      for (const userId of [ali, bea]) {
        await asUser(database, userId, async () => {
          await assert.rejects(
            database.query("update public.messages set body = 'Edited' where id = $1", [
              firstMessage.id,
            ]),
            isCode("42501"),
          );
          await assert.rejects(
            database.query("delete from public.messages where id = $1", [firstMessage.id]),
            isCode("42501"),
          );
        });
      }
    });

    it("rejects blank messages and messages over 2000 characters", async () => {
      for (const body of ["", "   ", "\n\t ", "x".repeat(2001)]) {
        await assert.rejects(
          send(database, ali, conversationId, body),
          isCode("23514"),
          JSON.stringify(body.slice(0, 10)),
        );
      }

      await send(database, ali, conversationId, "y".repeat(2000));
    });

    it("keeps last_message_at at the newest message", async () => {
      const latest = await send(database, ali, conversationId, "Newest");

      const { rows } = await database.query(
        "select last_message_at from public.conversations where id = $1",
        [conversationId],
      );

      assert.deepEqual(rows[0].last_message_at, latest.created_at);
    });

    it("streams inserted messages through Realtime", async () => {
      const { rows } = await database.query(
        `select tablename from pg_catalog.pg_publication_tables
         where pubname = 'supabase_realtime'`,
      );

      assert.deepEqual(rows, [{ tablename: "messages" }]);
    });
  });

  describe("read state", () => {
    it("lets each participant update only their own read state", async () => {
      await asUser(database, ali, async () => {
        const { affectedRows: own } = await database.query(
          `update public.conversation_reads set last_read_at = now()
           where conversation_id = $1 and user_id = $2`,
          [conversationId, ali],
        );
        const { affectedRows: other } = await database.query(
          `update public.conversation_reads set last_read_at = now()
           where conversation_id = $1 and user_id = $2`,
          [conversationId, bea],
        );

        assert.equal(own, 1);
        assert.equal(other, 0);
      });
    });

    it("does not let a third student touch anyone's read state", async () => {
      await asUser(database, cam, async () => {
        const { affectedRows } = await database.query(
          "update public.conversation_reads set last_read_at = now() where conversation_id = $1",
          [conversationId],
        );

        assert.equal(affectedRows, 0);
      });
    });

    it("protects everything but last_read_at", async () => {
      await asUser(database, ali, async () => {
        for (const assignment of [`user_id = '${cam}'`, `conversation_id = '${conversationId}'`]) {
          await assert.rejects(
            database.query(
              `update public.conversation_reads set ${assignment}
               where conversation_id = $1 and user_id = $2`,
              [conversationId, ali],
            ),
            isCode("42501"),
            assignment,
          );
        }

        await assert.rejects(
          database.query(
            "insert into public.conversation_reads (conversation_id, user_id) values ($1, $2)",
            [conversationId, cam],
          ),
          isCode("42501"),
        );
        await assert.rejects(
          database.query("delete from public.conversation_reads where user_id = $1", [ali]),
          isCode("42501"),
        );
      });
    });
  });

  describe("list_my_conversations", () => {
    let camConversation;

    before(async () => {
      // A fresh pair, so the flags below start from a known state.
      camConversation = await startConversation(database, cam, dee);
    });

    it("leaves out conversations that have no messages yet", async () => {
      assert.deepEqual(await inboxOf(database, cam), []);
      assert.deepEqual(await inboxOf(database, dee), []);
    });

    it("previews the last message: whitespace collapsed, first 100 characters", async () => {
      const long = `  Line one\n\n  line   two ${"word ".repeat(40)}`;
      await send(database, cam, camConversation, long);

      const [row] = await inboxOf(database, dee);
      const expected = long.replace(/\s+/g, " ").trim().slice(0, 100);

      assert.equal(row.conversation_id, camConversation);
      assert.equal(row.other_user_id, cam);
      assert.equal(row.other_user_name, "Cam Saad");
      assert.equal(row.last_message_preview, expected);
      assert.equal(row.last_message_preview.length, 100);
    });

    it("flags a conversation unread for the recipient until they read it", async () => {
      assert.equal((await inboxOf(database, dee))[0].unread, true);
      assert.equal(await unreadCountOf(database, dee), 1);

      // The sender's own message never makes the conversation unread for them.
      assert.equal((await inboxOf(database, cam))[0].unread, false);
      assert.equal(await unreadCountOf(database, cam), 0);

      await markRead(database, dee, camConversation);

      assert.equal((await inboxOf(database, dee))[0].unread, false);
      assert.equal(await unreadCountOf(database, dee), 0);
    });

    it("flags it unread again when a new message arrives", async () => {
      await send(database, cam, camConversation, "Are you there?");

      const [row] = await inboxOf(database, dee);

      assert.equal(row.unread, true);
      assert.equal(row.last_message_preview, "Are you there?");
    });

    it("lists only the student's own conversations, newest first", async () => {
      // Ali talks to Bea (earlier) and now Dee (newest).
      const aliAndDee = await startConversation(database, dee, ali);
      await send(database, dee, aliAndDee, "Hello Ali, it's Dee");

      const inbox = await inboxOf(database, ali);

      assert.deepEqual(
        inbox.map((row) => [row.other_user_name, row.unread]),
        [
          ["Dee Nasr", true],
          ["Bea Khoury", false],
        ],
      );
      assert.equal(await unreadCountOf(database, ali), 1);

      const camInbox = await inboxOf(database, cam);
      assert.deepEqual(camInbox.map((row) => row.other_user_id), [dee]);
    });

    it("is not callable by signed-out visitors", async () => {
      await database.exec("set role anon");

      try {
        for (const fn of ["list_my_conversations()", "count_my_unread_conversations()"]) {
          await assert.rejects(
            database.query(`select * from public.${fn}`),
            isCode("42501"),
            fn,
          );
        }
      } finally {
        await database.exec("reset role");
      }
    });
  });

  describe("deleting an account", () => {
    it("removes that student's conversations and messages", async () => {
      await database.query("delete from auth.users where id = $1", [dee]);

      const { rows } = await database.query(
        `select
           (select count(*)::int from public.conversations
             where $1 in (student_a, student_b)) as conversations,
           (select count(*)::int from public.messages where sender_id = $1) as messages`,
        [dee],
      );

      assert.deepEqual(rows, [{ conversations: 0, messages: 0 }]);
    });
  });
});
