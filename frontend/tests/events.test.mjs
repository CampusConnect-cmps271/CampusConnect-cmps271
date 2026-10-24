
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

async function readMigration(filename) {
  const contents = await readFile(
    new URL(`../../supabase/migrations/${filename}`, import.meta.url),
    "utf8",
  );

  return contents.replace(/^\uFEFF/, "");
}

const rolesMigration = await readMigration(
  "20261005010000_roles_and_permissions.sql",
);

const eventsMigration = await readMigration(
  "20261024120000_create_events.sql",
);

const ownershipMigration = await readMigration(
  "20261024130000_protect_event_ownership.sql",
);

const users = {
  student: "00000000-0000-4000-8000-000000000001",
  organizer: "00000000-0000-4000-8000-000000000002",
  otherOrganizer: "00000000-0000-4000-8000-000000000003",
  moderator: "00000000-0000-4000-8000-000000000004",
  administrator: "00000000-0000-4000-8000-000000000005",
};

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

  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;

  insert into auth.users (id, email) values
    ('${users.student}', 'student@mail.aub.edu'),
    ('${users.organizer}', 'organizer@mail.aub.edu'),
    ('${users.otherOrganizer}', 'other@mail.aub.edu'),
    ('${users.moderator}', 'moderator@mail.aub.edu'),
    ('${users.administrator}', 'admin@mail.aub.edu');
`;

async function asUser(database, userId, callback) {
  await database.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '${userId}';
  `);

  try {
    return await callback();
  } finally {
    await database.exec(
      "reset role; reset request.jwt.claim.sub;",
    );
  }
}

function eventData(organizerId, overrides = {}) {
  return {
    organizer_id: organizerId,
    title: "Campus Technology Workshop",
    description: "An introduction to software development.",
    starts_at: "2026-11-10T14:00:00+02:00",
    ends_at: "2026-11-10T16:00:00+02:00",
    timezone: "Asia/Beirut",
    location: "AUB Campus",
    category: "Academics",
    status: "published",
    registration_url: "https://example.com/register",
    ...overrides,
  };
}

async function insertEvent(database, data) {
  const fields = [
    "organizer_id",
    "title",
    "description",
    "starts_at",
    "ends_at",
    "timezone",
    "location",
    "category",
    "status",
    "registration_url",
  ];

  const values = fields.map((field) => data[field]);
  const placeholders = fields.map(
    (_, index) => `$${index + 1}`,
  );

  return database.query(
    `insert into public.events (${fields.join(", ")})
     values (${placeholders.join(", ")})
     returning id, organizer_id, status`,
    values,
  );
}

describe("SP3-13 event model and permissions", () => {
  let database;

  before(async () => {
    database = new PGlite();

    await database.exec(foundation);
    await database.exec(rolesMigration);
    await database.exec(eventsMigration);
    await database.exec(ownershipMigration);

    await database.exec(`
      update public.user_roles
      set role = 'club_representative'
      where user_id in (
        '${users.organizer}',
        '${users.otherOrganizer}'
      );

      update public.user_roles
      set role = 'moderator'
      where user_id = '${users.moderator}';

      update public.user_roles
      set role = 'administrator'
      where user_id = '${users.administrator}';
    `);
  });

  after(async () => {
    await database?.close();
  });

  it("creates the events table", async () => {
    const result = await database.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'events'
    `);

    assert.equal(result.rows.length, 1);
  });

  it("allows a club representative to publish their own event", async () => {
    await asUser(database, users.organizer, async () => {
      const result = await insertEvent(
        database,
        eventData(users.organizer),
      );

      assert.equal(result.rows.length, 1);
      assert.equal(
        result.rows[0].organizer_id,
        users.organizer,
      );
      assert.equal(result.rows[0].status, "published");
    });
  });

  it("allows an organizer to create a draft", async () => {
    await asUser(database, users.organizer, async () => {
      const result = await insertEvent(
        database,
        eventData(users.organizer, {
          status: "draft",
        }),
      );

      assert.equal(result.rows[0].status, "draft");
    });
  });

  it("rejects event creation by students", async () => {
    await asUser(database, users.student, async () => {
      await assert.rejects(
        insertEvent(
          database,
          eventData(users.student),
        ),
      );
    });
  });

  it("rejects event creation by moderators", async () => {
    await asUser(database, users.moderator, async () => {
      await assert.rejects(
        insertEvent(
          database,
          eventData(users.moderator),
        ),
      );
    });
  });

  it("rejects forged organizer IDs", async () => {
    await asUser(database, users.organizer, async () => {
      await assert.rejects(
        insertEvent(
          database,
          eventData(users.otherOrganizer),
        ),
      );
    });
  });

  it("allows administrators to create their own events", async () => {
    await asUser(
      database,
      users.administrator,
      async () => {
        const result = await insertEvent(
          database,
          eventData(users.administrator),
        );

        assert.equal(result.rows.length, 1);
      },
    );
  });

  it("prevents an organizer from updating another organizer's event", async () => {
    let eventId;

    await asUser(
      database,
      users.otherOrganizer,
      async () => {
        const result = await insertEvent(
          database,
          eventData(users.otherOrganizer),
        );

        eventId = result.rows[0].id;
      },
    );

    await asUser(database, users.organizer, async () => {
      const result = await database.query(
        `update public.events
         set title = 'Unauthorized change'
         where id = $1
         returning id`,
        [eventId],
      );

      assert.equal(result.rows.length, 0);
    });
  });

  it("prevents changing an event's organizer even with database privileges", async () => {
    const created = await insertEvent(
      database,
      eventData(users.organizer),
    );

    const eventId = created.rows[0].id;

    await assert.rejects(
      database.query(
        `update public.events
         set organizer_id = $1
         where id = $2`,
        [users.otherOrganizer, eventId],
      ),
      /Event organizer cannot be changed/,
    );
  });

  it("rejects an event ending before it starts", async () => {
    await asUser(database, users.organizer, async () => {
      await assert.rejects(
        insertEvent(
          database,
          eventData(users.organizer, {
            ends_at: "2026-11-10T12:00:00+02:00",
          }),
        ),
      );
    });
  });

  it("rejects blank event titles", async () => {
    await asUser(database, users.organizer, async () => {
      await assert.rejects(
        insertEvent(
          database,
          eventData(users.organizer, {
            title: "   ",
          }),
        ),
      );
    });
  });

  it("rejects unsafe registration URLs", async () => {
    await asUser(database, users.organizer, async () => {
      await assert.rejects(
        insertEvent(
          database,
          eventData(users.organizer, {
            registration_url: "javascript:alert(1)",
          }),
        ),
      );
    });
  });

  it("allows signed-in students to view published events", async () => {
    await asUser(database, users.student, async () => {
      const result = await database.query(`
        select id
        from public.events
        where status = 'published'
      `);

      assert.ok(result.rows.length > 0);
    });
  });

  it("hides private drafts from other students", async () => {
    await asUser(database, users.student, async () => {
      const result = await database.query(`
        select id
        from public.events
        where status = 'draft'
      `);

      assert.equal(result.rows.length, 0);
    });
  });
});
