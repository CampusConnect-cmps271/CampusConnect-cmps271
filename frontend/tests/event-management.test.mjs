
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

const rolesMigration = await readMigration(
  "20261005010000_roles_and_permissions.sql",
);

const eventsMigration = await readMigration(
  "20261024120000_create_events.sql",
);

const ownershipMigration = await readMigration(
  "20261024130000_protect_event_ownership.sql",
);

const managementMigration = await readMigration(
  "20261028150000_event_management_rules.sql",
);

const users = {
  student: "20000000-0000-4000-8000-000000000001",
  organizer: "20000000-0000-4000-8000-000000000002",
  otherOrganizer: "20000000-0000-4000-8000-000000000003",
  moderator: "20000000-0000-4000-8000-000000000004",
  administrator: "20000000-0000-4000-8000-000000000005",
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
    ('${users.student}', 'student@aub.edu'),
    ('${users.organizer}', 'organizer@aub.edu'),
    ('${users.otherOrganizer}', 'other@aub.edu'),
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

async function createEvent(
  db,
  organizerId,
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
    values (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9
    )
    returning id, organizer_id, title, status, revision`,
    [
      organizerId,
      "Original Event Title",
      "Original event description",
      "2026-11-15T12:00:00Z",
      "2026-11-15T14:00:00Z",
      "Asia/Beirut",
      "AUB Campus",
      "Academics",
      status,
    ],
  );

  return result.rows[0];
}

async function updateEvent(
  db,
  eventId,
  revision,
  changes,
) {
  const fields = Object.keys(changes);
  const values = Object.values(changes);

  if (fields.length === 0) {
    throw new Error("No changes supplied.");
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
    [eventId, revision, ...values],
  );
}

async function getStoredEvent(db, eventId) {
  const result = await db.query(
    `select *
     from public.events
     where id = $1`,
    [eventId],
  );

  return result.rows[0];
}

describe("SP3-16 event management and permissions", () => {
  let db;

  before(async () => {
    db = new PGlite();

    await db.exec(foundation);
    await db.exec(rolesMigration);
    await db.exec(eventsMigration);
    await db.exec(ownershipMigration);
    await db.exec(managementMigration);

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

  it("creates events with revision 1", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    assert.equal(event.revision, 1);
  });

  it("allows an organizer to edit their own event", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { title: "Updated Workshop Title" },
      );

      assert.equal(result.rows.length, 1);
      assert.equal(
        result.rows[0].title,
        "Updated Workshop Title",
      );
      assert.equal(result.rows[0].revision, 2);
    });
  });

  it("increases the revision after each edit", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      const first = await updateEvent(
        db,
        event.id,
        1,
        { title: "First Change" },
      );

      assert.equal(first.rows[0].revision, 2);

      const second = await updateEvent(
        db,
        event.id,
        2,
        { title: "Second Change" },
      );

      assert.equal(second.rows[0].revision, 3);
    });
  });

  it("prevents a student from editing events", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.student, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { title: "Student Edit" },
      );

      assert.equal(result.rows.length, 0);
    });
  });

  it("prevents a moderator from editing events", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.moderator, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { title: "Moderator Edit" },
      );

      assert.equal(result.rows.length, 0);
    });
  });

  it("prevents an organizer from editing another organizer's event", async () => {
    const event = await createEvent(
      db,
      users.otherOrganizer,
    );

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { title: "Unauthorized Change" },
      );

      assert.equal(result.rows.length, 0);
    });
  });

  it("allows an administrator to edit their own event", async () => {
    const event = await createEvent(
      db,
      users.administrator,
    );

    await asUser(
      db,
      users.administrator,
      async () => {
        const result = await updateEvent(
          db,
          event.id,
          1,
          { title: "Administrator Update" },
        );

        assert.equal(result.rows.length, 1);
        assert.equal(result.rows[0].revision, 2);
      },
    );
  });

  it("prevents administrators from editing events they do not own", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(
      db,
      users.administrator,
      async () => {
        const result = await updateEvent(
          db,
          event.id,
          1,
          { title: "Unauthorized Administrator Edit" },
        );

        assert.equal(result.rows.length, 0);
      },
    );
  });

  it("allows an organizer to publish a draft", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "draft",
    );

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { status: "published" },
      );

      assert.equal(result.rows[0].status, "published");
      assert.equal(result.rows[0].revision, 2);
    });
  });

  it("prevents a published event from returning to draft", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "published",
    );

    await asUser(db, users.organizer, async () => {
      await assert.rejects(
        updateEvent(
          db,
          event.id,
          1,
          { status: "draft" },
        ),
        /Published events cannot return to draft/,
      );
    });
  });

  it("allows an organizer to cancel their own event", async () => {
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

      assert.equal(result.rows[0].status, "cancelled");
      assert.equal(result.rows[0].revision, 2);
    });
  });

  it("retains cancelled events in the database", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );
    });

    const stored = await getStoredEvent(db, event.id);

    assert.ok(stored);
    assert.equal(stored.status, "cancelled");
  });

  it("prevents students from cancelling events", async () => {
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
  });

  it("prevents another organizer from cancelling an event", async () => {
    const event = await createEvent(
      db,
      users.organizer,
      "published",
    );

    await asUser(
      db,
      users.otherOrganizer,
      async () => {
        const result = await updateEvent(
          db,
          event.id,
          1,
          { status: "cancelled" },
        );

        assert.equal(result.rows.length, 0);
      },
    );
  });

  it("prevents edits to a cancelled event", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      const cancelled = await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      assert.equal(cancelled.rows.length, 1);

      const edit = await updateEvent(
        db,
        event.id,
        2,
        { title: "Edited After Cancellation" },
      );

      // RLS filters out cancelled rows.
      assert.equal(edit.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.status, "cancelled");
    assert.equal(stored.title, "Original Event Title");
    assert.equal(stored.revision, 2);
  });

  it("prevents a cancelled event from being restored", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      const cancelled = await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      assert.equal(cancelled.rows.length, 1);

      const restored = await updateEvent(
        db,
        event.id,
        2,
        { status: "published" },
      );

      assert.equal(restored.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.status, "cancelled");
    assert.equal(stored.revision, 2);
  });

  it("rejects stale edits using the revision number", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      const first = await updateEvent(
        db,
        event.id,
        1,
        { title: "Latest Version" },
      );

      assert.equal(first.rows[0].revision, 2);

      const stale = await updateEvent(
        db,
        event.id,
        1,
        { title: "Outdated Version" },
      );

      assert.equal(stale.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.title, "Latest Version");
    assert.equal(stored.revision, 2);
  });

  it("rejects stale cancellation requests", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      await updateEvent(
        db,
        event.id,
        1,
        { title: "New Event Information" },
      );

      const result = await updateEvent(
        db,
        event.id,
        1,
        { status: "cancelled" },
      );

      assert.equal(result.rows.length, 0);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.status, "draft");
    assert.equal(stored.revision, 2);
  });

  it("prevents manually changing the revision", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    // Authenticated users cannot update revision directly.
    await asUser(db, users.organizer, async () => {
      await assert.rejects(
        updateEvent(
          db,
          event.id,
          1,
          { revision: 999 },
        ),
        /permission denied/,
      );
    });

    // Even a privileged connection is blocked by the trigger.
    await assert.rejects(
      updateEvent(
        db,
        event.id,
        1,
        { revision: 999 },
      ),
      /Event revision cannot be changed manually/,
    );

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.revision, 1);
  });

  it("prevents changing event ownership", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await assert.rejects(
      db.query(
        `update public.events
         set organizer_id = $1
         where id = $2`,
        [users.otherOrganizer, event.id],
      ),
      /Event organizer cannot be changed/,
    );
  });

  it("keeps the event ID unchanged after editing", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        { title: "Renamed Event" },
      );

      assert.equal(result.rows[0].id, event.id);
    });
  });

  it("allows editing location and description", async () => {
    const event = await createEvent(
      db,
      users.organizer,
    );

    await asUser(db, users.organizer, async () => {
      const result = await updateEvent(
        db,
        event.id,
        1,
        {
          location: "West Hall",
          description: "Updated description",
        },
      );

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].revision, 2);
    });

    const stored = await getStoredEvent(db, event.id);

    assert.equal(stored.location, "West Hall");
    assert.equal(
      stored.description,
      "Updated description",
    );
  });
});
