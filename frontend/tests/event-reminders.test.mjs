
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationNames = [
  "20261005010000_roles_and_permissions.sql",
  "20261024120000_create_events.sql",
  "20261024130000_protect_event_ownership.sql",
  "20261028150000_event_management_rules.sql",
  "20261030210000_saved_events_reminders.sql",
];

async function readMigration(name) {
  const sql = await readFile(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
  return sql.replace(/^\uFEFF/, "");
}

const migrations = await Promise.all(
  migrationNames.map(readMigration),
);

const users = {
  organizer: "60000000-0000-4000-8000-000000000001",
  studentA: "60000000-0000-4000-8000-000000000002",
  studentB: "60000000-0000-4000-8000-000000000003",
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
  language sql stable
  as $$
    select nullif(
      current_setting('request.jwt.claim.sub', true), ''
    )::uuid;
  $$;

  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;

  insert into auth.users (id, email) values
    ('${users.organizer}', 'organizer@aub.edu'),
    ('${users.studentA}', 'a@aub.edu'),
    ('${users.studentB}', 'b@aub.edu');
`;

async function asUser(db, userId, callback) {
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '${userId}';
  `);

  try {
    return await callback();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

async function createEvent(db, status = "published") {
  const result = await db.query(
    `insert into public.events (
       organizer_id, title, description,
       starts_at, ends_at, timezone,
       location, category, status
     )
     values (
       $1, 'Reminder Test Event', 'Test description',
       '2099-11-15T14:00:00Z',
       '2099-11-15T16:00:00Z',
       'Asia/Beirut', 'West Hall',
       'Academics', $2
     )
     returning id`,
    [users.organizer, status],
  );

  return result.rows[0].id;
}

async function saveEvent(
  db,
  studentId,
  eventId,
  enabled = true,
  minutes = 60,
) {
  return db.query(
    `insert into public.saved_events (
       student_id, event_id,
       reminder_enabled, reminder_minutes_before
     )
     values ($1, $2, $3, $4)
     returning *`,
    [studentId, eventId, enabled, minutes],
  );
}

async function getJob(db, studentId, eventId) {
  const result = await db.query(
    `select *
     from public.event_reminder_jobs
     where student_id = $1 and event_id = $2`,
    [studentId, eventId],
  );

  return result.rows[0] ?? null;
}

describe("SP3-25 private saved events and reminder schedules", () => {
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
      where user_id = '${users.organizer}';
    `);
  });

  after(async () => {
    await db?.close();
  });

  it("allows a student to save a published event", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      const result = await saveEvent(
        db, users.studentA, eventId,
      );

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].reminder_enabled, true);
    });
  });

  it("prevents duplicate saves for the same student and event", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);

      await assert.rejects(
        saveEvent(db, users.studentA, eventId),
      );
    });
  });

  it("allows different students to save the same event", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);
    });

    await asUser(db, users.studentB, async () => {
      await saveEvent(db, users.studentB, eventId);
    });

    const result = await db.query(
      `select student_id
       from public.saved_events
       where event_id = $1`,
      [eventId],
    );

    assert.equal(result.rows.length, 2);
  });

  it("prevents saving on behalf of another student", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await assert.rejects(
        saveEvent(db, users.studentB, eventId),
      );
    });
  });

  it("keeps saved events private", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);
    });

    await asUser(db, users.studentB, async () => {
      const result = await db.query(
        `select *
         from public.saved_events
         where event_id = $1`,
        [eventId],
      );

      assert.equal(result.rows.length, 0);
    });
  });

  it("rejects saving a draft event", async () => {
    const eventId = await createEvent(db, "draft");

    await asUser(db, users.studentA, async () => {
      await assert.rejects(
        saveEvent(db, users.studentA, eventId),
      );
    });
  });

  it("rejects saving a cancelled event", async () => {
    const eventId = await createEvent(db);

    await db.query(
      `update public.events
       set status = 'cancelled'
       where id = $1`,
      [eventId],
    );

    await asUser(db, users.studentA, async () => {
      await assert.rejects(
        saveEvent(db, users.studentA, eventId),
      );
    });
  });

  it("creates a pending reminder when saving an event", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);
    });

    const job = await getJob(db, users.studentA, eventId);

    assert.ok(job);
    assert.equal(job.delivery_state, "pending");
    assert.equal(
      new Date(job.remind_at).toISOString(),
      "2099-11-15T13:00:00.000Z",
    );
  });

  it("calculates reminders from the event timestamp", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(
        db, users.studentA, eventId, true, 120,
      );
    });

    const job = await getJob(db, users.studentA, eventId);

    assert.equal(
      new Date(job.remind_at).toISOString(),
      "2099-11-15T12:00:00.000Z",
    );
  });

  it("allows saving without enabling reminders", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(
        db, users.studentA, eventId, false,
      );
    });

    const job = await getJob(db, users.studentA, eventId);

    assert.equal(job.delivery_state, "suppressed");
  });

  it("allows opting out without deleting the saved event", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);

      await db.query(
        `update public.saved_events
         set reminder_enabled = false
         where student_id = $1 and event_id = $2`,
        [users.studentA, eventId],
      );
    });

    const save = await db.query(
      `select reminder_enabled
       from public.saved_events
       where student_id = $1 and event_id = $2`,
      [users.studentA, eventId],
    );

    const job = await getJob(db, users.studentA, eventId);

    assert.equal(save.rows.length, 1);
    assert.equal(save.rows[0].reminder_enabled, false);
    assert.equal(job.delivery_state, "suppressed");
  });

  it("allows enabling reminders again", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(
        db, users.studentA, eventId, false,
      );

      await db.query(
        `update public.saved_events
         set reminder_enabled = true
         where student_id = $1 and event_id = $2`,
        [users.studentA, eventId],
      );
    });

    const job = await getJob(db, users.studentA, eventId);

    assert.equal(job.delivery_state, "pending");
  });

  it("reschedules reminders when event time changes", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);
    });

    await db.query(
      `update public.events
       set starts_at = '2099-11-16T14:00:00Z',
           ends_at = '2099-11-16T16:00:00Z'
       where id = $1`,
      [eventId],
    );

    const job = await getJob(db, users.studentA, eventId);

    assert.equal(
      new Date(job.remind_at).toISOString(),
      "2099-11-16T13:00:00.000Z",
    );
    assert.equal(job.delivery_state, "pending");
  });

  it("suppresses reminders after event cancellation", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);
    });

    await db.query(
      `update public.events
       set status = 'cancelled'
       where id = $1`,
      [eventId],
    );

    const job = await getJob(db, users.studentA, eventId);

    assert.equal(job.delivery_state, "suppressed");
  });

  it("does not delete the saved event when an event is cancelled", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);
    });

    await db.query(
      `update public.events
       set status = 'cancelled'
       where id = $1`,
      [eventId],
    );

    const result = await db.query(
      `select *
       from public.saved_events
       where student_id = $1 and event_id = $2`,
      [users.studentA, eventId],
    );

    assert.equal(result.rows.length, 1);
  });

  it("prevents students from changing reminder delivery state", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);

      await assert.rejects(
        db.query(
          `update public.event_reminder_jobs
           set delivery_state = 'delivered',
               delivered_at = now()
           where student_id = $1 and event_id = $2`,
          [users.studentA, eventId],
        ),
      );
    });
  });

  it("keeps reminder jobs private", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);
    });

    await asUser(db, users.studentB, async () => {
      const result = await db.query(
        `select *
         from public.event_reminder_jobs
         where event_id = $1`,
        [eventId],
      );

      assert.equal(result.rows.length, 0);
    });
  });

  it("deletes reminder jobs when a student unsaves an event", async () => {
    const eventId = await createEvent(db);

    await asUser(db, users.studentA, async () => {
      await saveEvent(db, users.studentA, eventId);

      await db.query(
        `delete from public.saved_events
         where student_id = $1 and event_id = $2`,
        [users.studentA, eventId],
      );
    });

    const job = await getJob(db, users.studentA, eventId);

    assert.equal(job, null);
  });
});
