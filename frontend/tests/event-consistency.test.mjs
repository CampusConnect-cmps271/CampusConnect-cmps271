
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

async function readMigration(filename) {
  const sql = await readFile(
    new URL(`../../supabase/migrations/${filename}`, import.meta.url),
    "utf8",
  );

  return sql.replace(/^\uFEFF/, "");
}

const migrationNames = [
  "20261005010000_roles_and_permissions.sql",
  "20261024120000_create_events.sql",
  "20261024130000_protect_event_ownership.sql",
  "20261028150000_event_management_rules.sql",
];

const migrations = await Promise.all(
  migrationNames.map(readMigration),
);

const users = {
  organizer: "30000000-0000-4000-8000-000000000001",
  otherOrganizer: "30000000-0000-4000-8000-000000000002",
  student: "30000000-0000-4000-8000-000000000003",
  administrator: "30000000-0000-4000-8000-000000000004",
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
    ('${users.organizer}', 'organizer@aub.edu'),
    ('${users.otherOrganizer}', 'other@aub.edu'),
    ('${users.student}', 'student@aub.edu'),
    ('${users.administrator}', 'admin@aub.edu');
`;

async function asUser(db, userId, callback) {
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '${userId}';
  `);

  try {
    return await callback();
  } finally {
    await db.exec(
      "reset role; reset request.jwt.claim.sub;",
    );
  }
}

async function createEvent(
  db,
  organizerId = users.organizer,
  status = "draft",
) {
  const result = await db.query(
    `insert into public.events (
      organizer_id,
      title,
      description,
      starts_at,
      ends_at,
      timezone,
      location,
      category,
      status
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    returning id, organizer_id, title, status, revision`,
    [
      organizerId,
      "Original Campus Event",
      "A campus event for students.",
      "2026-11-18T12:00:00Z",
      "2026-11-18T14:00:00Z",
      "Asia/Beirut",
      "West Hall",
      "Academics",
      status,
    ],
  );

  return result.rows[0];
}

async function updateEvent(
  db,
  eventId,
  expectedRevision,
  changes,
) {
  const allowedFields = new Set([
    "title",
    "description",
    "starts_at",
    "ends_at",
    "location",
    "category",
    "status",
  ]);

  const fields = Object.keys(changes);

  if (
    fields.length === 0 ||
    fields.some((field) => !allowedFields.has(field))
  ) {
    throw new Error("Invalid event update fields.");
  }

  const assignments = fields.map(
    (field, index) => `${field} = $${index + 3}`,
  );

  return db.query(
    `update public.events
     set ${assignments.join(", ")}
     where id = $1
       and revision = $2
     returning id, title, status, revision`,
    [
      eventId,
      expectedRevision,
      ...Object.values(changes),
    ],
  );
}

async function getStoredEvent(db, eventId) {
  const result = await db.query(
    `select *
     from public.events
     where id = $1`,
    [eventId],
  );

  return result.rows[0] ?? null;
}

describe("SP3-18: Event management consistency", () => {
  let db;

  before(async () => {
    db = new PGlite();

    await db.exec(foundation);

    for (const migration of migrations) {
      await db.exec(migration);
    }

    await db.exec(`
      update public.user_roles
      set role = 'club_representative'
      where user_id in (
        '${users.organizer}',
        '${users.otherOrganizer}'
      );

      update public.user_roles
      set role = 'administrator'
      where user_id = '${users.administrator}';
    `);
  });

  after(async () => {
    await db?.close();
  });

  it("prevents one organizer from editing another organizer's event", async () => {
    const event = await createEvent(
      db,
      users.otherOrganizer,
    );

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { title: "Unauthorized Edit" },
      );

      assert.equal(result.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.title, "Original Campus Event");
    assert.equal(stored.revision, 1);
  });

  it("prevents one organizer from cancelling another organizer's event", async () => {
    const event = await createEvent(
      db,
      users.otherOrganizer,
      "published",
    );

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      assert.equal(result.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.status, "published");
  });

  it("prevents students from cancelling published events", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "published",
    );

    await asUser(db, users.student, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      assert.equal(result.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.status, "published");
  });

  it("allows the owner to edit and increments revision", async () => {
    const event = await createEvent(db);

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        {
          title: "Updated Campus Event",
          location: "Assembly Hall",
        },
      );

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].revision, 2);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.title, "Updated Campus Event");
    assert.equal(stored.location, "Assembly Hall");
    assert.equal(stored.revision, 2);
  });

  it("rejects stale edits without overwriting newer changes", async () => {
    const event = await createEvent(db);

    await asUser(db, users.organizer, async () => {
      const first = await updateEvent(
        db,
        event.id,
        1,
        { title: "Latest Title" },
      );

      assert.equal(first.rows[0].revision, 2);

      const stale = await updateEvent(
        db,
        event.id,
        1,
        { title: "Old Title" },
      );

      assert.equal(stale.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.title, "Latest Title");
    assert.equal(stored.revision, 2);
  });

  it("rejects stale cancellations after another edit", async () => {
    const event = await createEvent(db);

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        { location: "New Location" },
      );

      const staleCancellation = await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      assert.equal(staleCancellation.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.status, "draft");
    assert.equal(stored.location, "New Location");
    assert.equal(stored.revision, 2);
  });

  it("preserves the event record after cancellation", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "published",
    );

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].revision, 2);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.ok(stored);
    assert.equal(stored.id, event.id);
    assert.equal(stored.status, "cancelled");
  });

  it("prevents further changes after cancellation", async () => {
    const event = await createEvent(db);

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      const result = await updateEvent(
        db,
        event.id,
        2,
        { title: "Change After Cancellation" },
      );

      assert.equal(result.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.title, "Original Campus Event");
    assert.equal(stored.status, "cancelled");
    assert.equal(stored.revision, 2);
  });

  it("rejects restoring cancelled events", async () => {
    const event = await createEvent(db);

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      const result = await updateEvent(
        db,
        event.id,
        2,
        { status: "published" },
      );

      assert.equal(result.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.status, "cancelled");
  });

  it("reflects edited data in subsequent event detail queries", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "published",
    );

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        {
          title: "New Event Details",
          location: "West Hall Auditorium",
          starts_at: "2026-11-19T12:00:00Z",
          ends_at: "2026-11-19T14:00:00Z",
        },
      );
    });

    await asUser(db, users.student, async () => {
      const result = await db.query(
        `select title, location, starts_at
         from public.events
         where id = $1
           and status = 'published'`,
        [event.id],
      );

      assert.equal(result.rows.length, 1);
      assert.equal(
        result.rows[0].title,
        "New Event Details",
      );
      assert.equal(
        result.rows[0].location,
        "West Hall Auditorium",
      );
      assert.equal(
        new Date(result.rows[0].starts_at).toISOString(),
        "2026-11-19T12:00:00.000Z",
      );
    });
  });

  it("reflects updated dates in published event queries", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "published",
    );

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        {
          starts_at: "2026-11-21T10:00:00Z",
          ends_at: "2026-11-21T12:00:00Z",
        },
      );
    });

    await asUser(db, users.student, async () => {
      const result = await db.query(
        `select id, starts_at
         from public.events
         where status = 'published'
           and starts_at >= $1
           and starts_at < $2
           and id = $3`,
        [
          "2026-11-21T00:00:00Z",
          "2026-11-22T00:00:00Z",
          event.id,
        ],
      );

      assert.equal(result.rows.length, 1);
    });
  });

  it("removes cancelled events from published discovery queries", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "published",
    );

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );
    });

    await asUser(db, users.student, async () => {
      const result = await db.query(
        `select id
         from public.events
         where status = 'published'
           and id = $1`,
        [event.id],
      );

      assert.equal(result.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.status, "cancelled");
  });

  it("preserves the organizer after edits and cancellation", async () => {
    const event = await createEvent(db);

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        { title: "Owner Updated Event" },
      );

      await updateEvent(
        db,
        event.id,
        2,
        { status: "cancelled" },
      );
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.organizer_id, users.organizer);
    assert.equal(stored.revision, 3);
  });

  it("keeps valid published events readable by students", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "published",
    );

    await asUser(db, users.student, async () => {
      const result = await db.query(
        `select id
         from public.events
         where id = $1`,
        [event.id],
      );

      assert.equal(result.rows.length, 1);
    });
  });

  it("keeps organizer drafts private from other students", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "draft",
    );

    await asUser(db, users.student, async () => {
      const result = await db.query(
        `select id
         from public.events
         where id = $1`,
        [event.id],
      );

      assert.equal(result.rows.length, 0);
    });
  });
});

describe("SP3-18: Pending integration requirements", () => {
  it.todo(
    "Browser: cancelling requires explicit confirmation and declining leaves the event unchanged",
  );

  it.todo(
    "Discovery/detail pages reflect edits and cancellations through their actual application queries",
  );

  it.todo(
    "Reminders are rescheduled when an event start time changes",
  );

  it.todo(
    "Cancelling an event suppresses all outstanding reminders without duplicate delivery",
  );
});
