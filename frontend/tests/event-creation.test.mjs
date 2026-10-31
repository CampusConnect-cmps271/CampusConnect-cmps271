
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

import {
  EVENT_TIMEZONE,
  EVENT_CATEGORIES,
  getEventValues,
  validateEvent,
  beirutLocalToIso,
} from "../modules/events/validation.ts";

async function readMigration(filename) {
  const sql = await readFile(
    new URL(
      `../../supabase/migrations/${filename}`,
      import.meta.url,
    ),
    "utf8",
  );

  return sql.replace(/^\uFEFF/, "");
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
  student: "10000000-0000-4000-8000-000000000001",
  organizer: "10000000-0000-4000-8000-000000000002",
  otherOrganizer: "10000000-0000-4000-8000-000000000003",
  moderator: "10000000-0000-4000-8000-000000000004",
  administrator: "10000000-0000-4000-8000-000000000005",
};

function validEvent(overrides = {}) {
  return {
    title: "AUB Programming Workshop",
    description: "Learn the basics of programming.",
    startsAt: "2026-11-12T14:00",
    endsAt: "2026-11-12T16:00",
    location: "West Hall",
    category: "Academics",
    registrationUrl: "https://example.com/register",
    clubName: "Computer Science Club",
    ...overrides,
  };
}

function makeFormData(values) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

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
    ('${users.student}', 'student@aub.edu'),
    ('${users.organizer}', 'organizer@aub.edu'),
    ('${users.otherOrganizer}', 'organizer2@aub.edu'),
    ('${users.moderator}', 'moderator@aub.edu'),
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

async function createEvent(db, organizerId, overrides = {}) {
  const input = validEvent(overrides);

  const start = beirutLocalToIso(input.startsAt);
  const end = beirutLocalToIso(input.endsAt);

  assert.ok(start);
  assert.ok(end);

  const values = [
    organizerId,
    input.title,
    input.description,
    start,
    end,
    EVENT_TIMEZONE,
    input.location,
    input.category,
    overrides.status ?? "draft",
    input.registrationUrl || null,
    input.clubName || null,
  ];

  return db.query(
    `insert into public.events (
      organizer_id,
      title,
      description,
      starts_at,
      ends_at,
      timezone,
      location,
      category,
      status,
      registration_url,
      club_name
    )
    values (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11
    )
    returning
      id,
      organizer_id,
      title,
      starts_at,
      ends_at,
      timezone,
      status`,
    values,
  );
}

describe("SP3-15 event form validation", () => {
  it("accepts a complete event for publishing", () => {
    const result = validateEvent(
      validEvent(),
      "published",
    );

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, {});
    assert.ok(result.startsAt);
    assert.ok(result.endsAt);
  });

  it("accepts a valid draft", () => {
    const result = validateEvent(
      validEvent({ description: "" }),
      "draft",
    );

    assert.equal(result.valid, true);
  });

  it("requires a description when publishing", () => {
    const result = validateEvent(
      validEvent({ description: "" }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.description);
  });

  it("rejects an empty title", () => {
    const result = validateEvent(
      validEvent({ title: "" }),
      "draft",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.title);
  });

  it("rejects titles longer than 200 characters", () => {
    const result = validateEvent(
      validEvent({ title: "A".repeat(201) }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.title);
  });

  it("accepts a title with exactly 200 characters", () => {
    const result = validateEvent(
      validEvent({ title: "A".repeat(200) }),
      "published",
    );

    assert.equal(result.valid, true);
  });

  it("rejects descriptions longer than 10000 characters", () => {
    const result = validateEvent(
      validEvent({
        description: "A".repeat(10001),
      }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.description);
  });

  it("requires a location", () => {
    const result = validateEvent(
      validEvent({ location: "" }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.location);
  });

  it("rejects overly long locations", () => {
    const result = validateEvent(
      validEvent({ location: "L".repeat(301) }),
      "draft",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.location);
  });

  it("requires an event category", () => {
    const result = validateEvent(
      validEvent({ category: "" }),
      "draft",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.category);
  });

  it("provides selectable event categories", () => {
    assert.ok(EVENT_CATEGORIES.length > 0);
    assert.ok(
      EVENT_CATEGORIES.includes("Academics"),
    );
  });

  it("rejects overly long optional club names", () => {
    const result = validateEvent(
      validEvent({ clubName: "C".repeat(151) }),
      "draft",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.clubName);
  });

  it("accepts an empty registration URL", () => {
    const result = validateEvent(
      validEvent({ registrationUrl: "" }),
      "published",
    );

    assert.equal(result.valid, true);
  });

  it("rejects insecure HTTP registration URLs", () => {
    const result = validateEvent(
      validEvent({
        registrationUrl: "http://example.com",
      }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.registrationUrl);
  });

  it("rejects javascript registration URLs", () => {
    const result = validateEvent(
      validEvent({
        registrationUrl: "javascript:alert(1)",
      }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.registrationUrl);
  });

  it("rejects registration URLs containing credentials", () => {
    const result = validateEvent(
      validEvent({
        registrationUrl:
          "https://user:password@example.com",
      }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.registrationUrl);
  });

  it("rejects an end time before the start time", () => {
    const result = validateEvent(
      validEvent({
        startsAt: "2026-11-12T16:00",
        endsAt: "2026-11-12T14:00",
      }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.endsAt);
  });

  it("rejects equal start and end times", () => {
    const result = validateEvent(
      validEvent({
        startsAt: "2026-11-12T14:00",
        endsAt: "2026-11-12T14:00",
      }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.endsAt);
  });

  it("rejects invalid calendar dates", () => {
    const result = validateEvent(
      validEvent({
        startsAt: "2026-02-30T12:00",
      }),
      "draft",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.startsAt);
  });

  it("returns field errors together", () => {
    const result = validateEvent(
      validEvent({
        title: "",
        description: "",
        location: "",
        category: "",
      }),
      "published",
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.title);
    assert.ok(result.errors.description);
    assert.ok(result.errors.location);
    assert.ok(result.errors.category);
  });

  it("reads and trims submitted form values", () => {
    const formData = makeFormData({
      title: "  Campus Workshop  ",
      description: "  Learn together  ",
      startsAt: "2026-11-12T14:00",
      endsAt: "2026-11-12T16:00",
      location: "  West Hall  ",
      category: "Academics",
    });

    const values = getEventValues(formData);

    assert.equal(values.title, "Campus Workshop");
    assert.equal(values.location, "West Hall");
    assert.equal(values.description, "Learn together");
    assert.equal(values.registrationUrl, "");
    assert.equal(values.clubName, "");
  });
});

describe("SP3-15 Beirut timezone", () => {
  it("uses Asia/Beirut", () => {
    assert.equal(EVENT_TIMEZONE, "Asia/Beirut");
  });

  it("converts a winter date to UTC+2", () => {
    assert.equal(
      beirutLocalToIso("2026-11-12T14:00"),
      "2026-11-12T12:00:00.000Z",
    );
  });

  it("converts a summer date to UTC+3", () => {
    assert.equal(
      beirutLocalToIso("2026-07-12T14:00"),
      "2026-07-12T11:00:00.000Z",
    );
  });

  it("rejects nonexistent local times during spring DST", () => {
    assert.equal(
      beirutLocalToIso("2026-03-29T00:30"),
      null,
    );
  });

  it("rejects ambiguous times during autumn DST", () => {
    assert.equal(
      beirutLocalToIso("2026-10-24T23:30"),
      null,
    );
  });

  it("accepts a valid date after the spring DST change", () => {
    assert.ok(
      beirutLocalToIso("2026-03-29T09:00"),
    );
  });
});

describe("SP3-15 database creation authorization", () => {
  let db;

  before(async () => {
    db = new PGlite();

    await db.exec(foundation);
    await db.exec(rolesMigration);
    await db.exec(eventsMigration);
    await db.exec(ownershipMigration);

    await db.exec(`
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
    await db?.close();
  });

  it("allows a club representative to save a draft", async () => {
    await asUser(db, users.organizer, async () => {
      const result = await createEvent(
        db,
        users.organizer,
      );

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].status, "draft");
      assert.equal(
        result.rows[0].organizer_id,
        users.organizer,
      );
    });
  });

  it("allows a club representative to publish", async () => {
    await asUser(db, users.organizer, async () => {
      const result = await createEvent(
        db,
        users.organizer,
        { status: "published" },
      );

      assert.equal(result.rows[0].status, "published");
    });
  });

  it("allows an administrator to publish", async () => {
    await asUser(
      db,
      users.administrator,
      async () => {
        const result = await createEvent(
          db,
          users.administrator,
          { status: "published" },
        );

        assert.equal(
          result.rows[0].status,
          "published",
        );
      },
    );
  });

  it("prevents students from creating events", async () => {
    await asUser(db, users.student, async () => {
      await assert.rejects(
        createEvent(db, users.student),
      );
    });
  });

  it("prevents moderators from creating events", async () => {
    await asUser(db, users.moderator, async () => {
      await assert.rejects(
        createEvent(db, users.moderator),
      );
    });
  });

  it("prevents creating an event under another user's ID", async () => {
    await asUser(db, users.organizer, async () => {
      await assert.rejects(
        createEvent(db, users.otherOrganizer),
      );
    });
  });

  it("rejects an invalid status", async () => {
    await asUser(db, users.organizer, async () => {
      await assert.rejects(
        createEvent(db, users.organizer, {
          status: "deleted",
        }),
      );
    });
  });

  it("rejects invalid titles at the database level", async () => {
    await asUser(db, users.organizer, async () => {
      await assert.rejects(
        createEvent(db, users.organizer, {
          title: "",
        }),
      );
    });
  });

  it("saves start and end times with the correct timezone", async () => {
    await asUser(db, users.organizer, async () => {
      const result = await createEvent(
        db,
        users.organizer,
      );

      const event = result.rows[0];

      assert.equal(event.timezone, "Asia/Beirut");
      assert.equal(
        new Date(event.starts_at).toISOString(),
        "2026-11-12T12:00:00.000Z",
      );
      assert.equal(
        new Date(event.ends_at).toISOString(),
        "2026-11-12T14:00:00.000Z",
      );
    });
  });

  it("prevents one organizer from changing another organizer's event", async () => {
    let eventId;

    await asUser(
      db,
      users.otherOrganizer,
      async () => {
        const result = await createEvent(
          db,
          users.otherOrganizer,
        );

        eventId = result.rows[0].id;
      },
    );

    await asUser(db, users.organizer, async () => {
      const result = await db.query(
        `update public.events
         set title = 'Unauthorized'
         where id = $1
         returning id`,
        [eventId],
      );

      assert.equal(result.rows.length, 0);
    });
  });

  it("keeps an event's organizer immutable", async () => {
    const result = await createEvent(
      db,
      users.organizer,
    );

    const eventId = result.rows[0].id;

    await assert.rejects(
      db.query(
        `update public.events
         set organizer_id = $1
         where id = $2`,
        [users.otherOrganizer, eventId],
      ),
      /Event organizer cannot be changed/,
    );
  });

  it("hides drafts from other students", async () => {
    await asUser(db, users.student, async () => {
      const result = await db.query(`
        select id
        from public.events
        where status = 'draft'
      `);

      assert.equal(result.rows.length, 0);
    });
  });

  it("makes published events visible to students", async () => {
    await asUser(db, users.student, async () => {
      const result = await db.query(`
        select id
        from public.events
        where status = 'published'
      `);

      assert.ok(result.rows.length > 0);
    });
  });
});
