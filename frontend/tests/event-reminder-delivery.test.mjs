
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const users = {
  organizer: "70000000-0000-4000-8000-000000000001",
  student: "70000000-0000-4000-8000-000000000002",
  other: "70000000-0000-4000-8000-000000000003",
};

async function migration(name) {
  const sql = await readFile(
    new URL(
      `../../supabase/migrations/${name}`,
      import.meta.url,
    ),
    "utf8",
  );
  return sql.replace(/^\uFEFF/, "");
}

const migrationNames = [
  "20261005010000_roles_and_permissions.sql",
  "20261024120000_create_events.sql",
  "20261024130000_protect_event_ownership.sql",
  "20261028150000_event_management_rules.sql",
  "20261030210000_saved_events_reminders.sql",
  "20261030220000_event_reminder_delivery.sql",
];

async function asUser(db, id, callback) {
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '${id}';
  `);

  try {
    return await callback();
  } finally {
    await db.exec(
      "reset role; reset request.jwt.claim.sub;",
    );
  }
}

async function createEvent(db, secondsUntilStart = 3) {
  const result = await db.query(
    `insert into public.events (
       organizer_id, title, description,
       starts_at, ends_at, timezone,
       location, category, status
     )
     values (
       $1, 'Reminder Test Event', 'Test description',
       now() + ($2::integer * interval '1 second'),
       now() + interval '2 hours',
       'Asia/Beirut', 'West Hall', 'Academics',
       'published'
     )
     returning id`,
    [users.organizer, secondsUntilStart],
  );

  return result.rows[0].id;
}

async function saveEvent(db, eventId, options = {}) {
  const {
    student = users.student,
    enabled = true,
  } = options;

  await asUser(db, student, async () => {
    await db.query(
      `insert into public.saved_events (
         student_id,
         event_id,
         reminder_enabled,
         reminder_minutes_before
       )
       values ($1, $2, $3, 0)`,
      [student, eventId, enabled],
    );
  });
}

async function deliver(db) {
  const result = await db.query(
    `select public.deliver_due_event_reminders(50)
       as delivered`,
  );

  return result.rows[0].delivered;
}

async function notificationCount(db, eventId) {
  const result = await db.query(
    `select count(*)::integer as count
     from public.notifications
     where type = 'event_reminder'
       and event_id = $1`,
    [eventId],
  );

  return result.rows[0].count;
}

async function jobState(db, eventId) {
  const result = await db.query(
    `select delivery_state, remind_at, event_starts_at
     from public.event_reminder_jobs
     where event_id = $1
       and student_id = $2`,
    [eventId, users.student],
  );

  return result.rows[0] ?? null;
}

describe("SP3-26 reminder delivery", () => {
  let db;
  const events = {};

  before(async () => {
    db = new PGlite();

    await db.exec(`
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
          current_setting(
            'request.jwt.claim.sub', true
          ), ''
        )::uuid;
      $$;

      grant usage on schema auth to authenticated;
      grant execute on function auth.uid()
        to authenticated;

      insert into auth.users (id, email) values
        ('${users.organizer}', 'organizer@aub.edu'),
        ('${users.student}', 'student@aub.edu'),
        ('${users.other}', 'other@aub.edu');
    `);

    // Load the existing event database model.
    for (const name of migrationNames.slice(0, 4)) {
      await db.exec(await migration(name));
    }

    // Minimal existing notification schema for isolated
    // delivery testing. The real database keeps its
    // original notification tables and triggers.
    await db.exec(`
      create table public.notifications (
        id uuid primary key default gen_random_uuid(),
        recipient_id uuid not null
          references auth.users(id) on delete cascade,
        type text not null,
        actor_id uuid
          references auth.users(id),
        conversation_id uuid,
        post_id uuid,
        comment_id uuid,
        created_at timestamptz not null default now(),
        read_at timestamptz,

        constraint notifications_type_check
          check (
            type in (
              'message',
              'post_comment',
              'comment_reply',
              'content_removed'
            )
          ),

        constraint notifications_links_check
          check (
            case type
              when 'message' then
                actor_id is not null
                and conversation_id is not null
              when 'post_comment' then
                actor_id is not null
                and post_id is not null
                and comment_id is not null
              when 'comment_reply' then
                actor_id is not null
                and post_id is not null
                and comment_id is not null
              when 'content_removed' then
                post_id is not null
                or comment_id is not null
              else false
            end
          )
      );

      alter table public.notifications
        enable row level security;

      grant select on public.notifications
        to authenticated;

      grant select, insert, update, delete
        on public.notifications to service_role;

      create policy "Students read own notifications"
        on public.notifications
        for select to authenticated
        using (
          recipient_id = (select auth.uid())
        );
    `);

    // Apply SP3-25 and the pending SP3-26 migration.
    for (const name of migrationNames.slice(4)) {
      await db.exec(await migration(name));
    }

    events.due = await createEvent(db);
    events.cancelled = await createEvent(db);
    events.disabled = await createEvent(db);
    events.rescheduled = await createEvent(db);
    events.unsaved = await createEvent(db);

    await saveEvent(db, events.due);
    await saveEvent(db, events.cancelled);
    await saveEvent(db, events.disabled);
    await saveEvent(db, events.rescheduled);
    await saveEvent(db, events.unsaved);

    await db.query(
      `update public.events
       set status = 'cancelled'
       where id = $1`,
      [events.cancelled],
    );

    await asUser(db, users.student, async () => {
      await db.query(
        `update public.saved_events
         set reminder_enabled = false
         where event_id = $1`,
        [events.disabled],
      );

      await db.query(
        `delete from public.saved_events
         where event_id = $1`,
        [events.unsaved],
      );
    });

    await db.query(
      `update public.events
       set
         starts_at = now() + interval '1 hour',
         ends_at = now() + interval '3 hours'
       where id = $1`,
      [events.rescheduled],
    );

    // Allow the remaining short test reminder to
    // become due. No real clock or production data
    // is modified.
    await new Promise((resolve) =>
      setTimeout(resolve, 3500),
    );
  });

  after(async () => {
    await db?.close();
  });

  it("delivers a due reminder once", async () => {
    const count = await deliver(db);

    assert.equal(count, 1);
    assert.equal(
      await notificationCount(db, events.due),
      1,
    );

    const job = await jobState(db, events.due);

    assert.equal(job.delivery_state, "delivered");
  });

  it("does not duplicate reminders on a retry", async () => {
    const count = await deliver(db);

    assert.equal(count, 0);
    assert.equal(
      await notificationCount(db, events.due),
      1,
    );
  });

  it("does not duplicate a reminder when delivery is invoked twice", async () => {
    const results = await Promise.all([
      deliver(db),
      deliver(db),
    ]);

    assert.deepEqual(results, [0, 0]);

    assert.equal(
      await notificationCount(db, events.due),
      1,
    );
  });

  it("suppresses reminders for cancelled events", async () => {
    assert.equal(
      await notificationCount(db, events.cancelled),
      0,
    );

    const job = await jobState(db, events.cancelled);

    assert.equal(job.delivery_state, "suppressed");
  });

  it("suppresses disabled reminders", async () => {
    assert.equal(
      await notificationCount(db, events.disabled),
      0,
    );

    const job = await jobState(db, events.disabled);

    assert.equal(job.delivery_state, "suppressed");
  });

  it("does not notify students who unsaved an event", async () => {
    assert.equal(
      await notificationCount(db, events.unsaved),
      0,
    );

    const job = await jobState(db, events.unsaved);

    assert.equal(job, null);
  });

  it("updates due time after an event is rescheduled", async () => {
    const job = await jobState(
      db,
      events.rescheduled,
    );

    assert.equal(job.delivery_state, "pending");

    assert.equal(
      new Date(job.remind_at).toISOString(),
      new Date(job.event_starts_at).toISOString(),
    );

    assert.equal(
      await notificationCount(db, events.rescheduled),
      0,
    );
  });

  it("rejects direct delivery by students", async () => {
    await asUser(db, users.student, async () => {
      await assert.rejects(
        db.query(
          `select public.deliver_due_event_reminders(50)`,
        ),
      );
    });
  });

  it("rejects invalid delivery batch sizes", async () => {
    await assert.rejects(
      db.query(
        `select public.deliver_due_event_reminders(0)`,
      ),
      /Invalid reminder batch size/,
    );

    await assert.rejects(
      db.query(
        `select public.deliver_due_event_reminders(101)`,
      ),
      /Invalid reminder batch size/,
    );
  });

  it("keeps reminders private to their recipients", async () => {
    await asUser(db, users.other, async () => {
      const result = await db.query(
        `select *
         from public.notifications
         where type = 'event_reminder'`,
      );

      assert.equal(result.rows.length, 0);
    });

    await asUser(db, users.student, async () => {
      const result = await db.query(
        `select *
         from public.notifications
         where type = 'event_reminder'`,
      );

      assert.equal(result.rows.length, 1);
    });
  });
});
