import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// The planner calendar: a plan's own dated items and going marks on saved
// events. Loads the events chain too, since going_events builds on
// saved_events.
const migrationNames = [
  "20261005010000_roles_and_permissions.sql",
  "20261024120000_create_events.sql",
  "20261024130000_protect_event_ownership.sql",
  "20261028150000_event_management_rules.sql",
  "20261030210000_saved_events_reminders.sql",
  "20261017091812_create_courses.sql",
  "20261031140841_planner_semester_plans.sql",
  "20261031221500_planner_calendar_items.sql",
];

async function readMigration(name) {
  const sql = await readFile(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
  return sql.replace(/^﻿/, "");
}

const migrations = await Promise.all(migrationNames.map(readMigration));

const users = {
  organizer: "73000000-0000-4000-8000-000000000001",
  studentA: "73000000-0000-4000-8000-000000000002",
  studentB: "73000000-0000-4000-8000-000000000003",
};

const courseIds = [
  "74000000-0000-4000-8000-000000000001",
  "74000000-0000-4000-8000-000000000002",
];

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
    ('${users.organizer}', 'organizer@mail.aub.edu'),
    ('${users.studentA}', 'a@mail.aub.edu'),
    ('${users.studentB}', 'b@mail.aub.edu');
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

/** Asserts the promise fails with this SQLSTATE. */
async function rejectsWith(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

// Spring 2026-27's official dates.
const SPRING = { startsOn: "2027-01-13", endsOn: "2027-04-27" };
let termIndex = 0;

/**
 * A new plan for the current user with Spring 2027's dates. Each call uses
 * a different term name, since a student has one plan per term.
 */
async function createPlan(db) {
  const term = `${["Fall", "Spring", "Summer"][termIndex % 3]} ${2025 + Math.floor(termIndex / 3)}`;
  termIndex += 1;
  const result = await db.query(
    `insert into public.semester_plans (term, starts_on, ends_on)
     values ($1, $2, $3) returning *`,
    [term, SPRING.startsOn, SPRING.endsOn],
  );
  return result.rows[0];
}

async function addCourse(db, planId, courseId = courseIds[0]) {
  const result = await db.query(
    "insert into public.plan_courses (plan_id, course_id) values ($1, $2) returning *",
    [planId, courseId],
  );
  return result.rows[0];
}

async function addItem(db, planId, fields = {}) {
  const item = { title: "Midterm", on_date: "2027-03-02", start_minute: 600, end_minute: 660, plan_course_id: null, ...fields };
  const result = await db.query(
    `insert into public.plan_items (plan_id, plan_course_id, title, on_date, start_minute, end_minute)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [planId, item.plan_course_id, item.title, item.on_date, item.start_minute, item.end_minute],
  );
  return result.rows[0];
}

async function createEvent(db) {
  const result = await db.query(
    `insert into public.events (organizer_id, title, description, starts_at, ends_at, timezone, location, category, status)
     values ($1, 'Calendar test event', '', '2099-03-02T08:00:00Z', '2099-03-02T10:00:00Z',
             'Asia/Beirut', 'West Hall', 'Academics', 'published')
     returning id`,
    [users.organizer],
  );
  return result.rows[0].id;
}

const saveEvent = (db, eventId) =>
  db.query("insert into public.saved_events (student_id, event_id) values (auth.uid(), $1)", [eventId]);

const markGoing = (db, eventId) =>
  db.query("insert into public.going_events (event_id) values ($1) returning *", [eventId]);

// Each test uses fresh plans; studentA and studentB keep at most 10 each.
describe("planner calendar items and going marks", () => {
  let db;

  before(async () => {
    db = new PGlite();
    await db.exec(foundation);
    for (const migration of migrations) await db.exec(migration);

    await db.exec(`
      update public.user_roles set role = 'club_representative'
      where user_id = '${users.organizer}';
    `);

    for (const [index, id] of courseIds.entries()) {
      await db.query(
        `insert into public.courses (id, code, name, description, credits, department)
         values ($1, $2, $3, 'Synthetic course for planner tests.', 3, 'Testing')`,
        [id, `TEST ${201 + index}`, `Test course ${index + 1}`],
      );
    }
  });

  after(async () => {
    await db?.close();
  });

  describe("plan items", () => {
    it("lets a student add timed and all-day items to their own plan", async () => {
      await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db);
        const timed = await addItem(db, plan.id);
        const allDay = await addItem(db, plan.id, { title: "Project due", start_minute: null, end_minute: null });

        assert.equal(timed.start_minute, 600);
        assert.equal(allDay.start_minute, null);

        const { rows } = await db.query("select id from public.plan_items where plan_id = $1", [plan.id]);
        assert.equal(rows.length, 2);
      });
    });

    it("refuses blank titles, half-set times and an end before the start", async () => {
      await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db);
        await rejectsWith(addItem(db, plan.id, { title: "   " }), "23514");
        await rejectsWith(addItem(db, plan.id, { title: "x".repeat(121) }), "23514");
        await rejectsWith(addItem(db, plan.id, { end_minute: null }), "23514");
        await rejectsWith(addItem(db, plan.id, { start_minute: 660, end_minute: 600 }), "23514");
        await rejectsWith(addItem(db, plan.id, { start_minute: 1440, end_minute: 1440 }), "23514");
      });
    });

    it("keeps items within 30 days of the plan's classes", async () => {
      await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db);
        await addItem(db, plan.id, { on_date: "2026-12-14" });
        await addItem(db, plan.id, { on_date: "2027-05-27" });
        await rejectsWith(addItem(db, plan.id, { on_date: "2026-12-13" }), "23514");
        await rejectsWith(addItem(db, plan.id, { on_date: "2027-05-28" }), "23514");

        const item = await addItem(db, plan.id);
        await rejectsWith(
          db.query("update public.plan_items set on_date = '2027-06-30' where id = $1", [item.id]),
          "23514",
        );
      });
    });

    it("links only courses in the same plan, and keeps an item when its course is removed", async () => {
      await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db);
        const other = await createPlan(db);
        const planned = await addCourse(db, plan.id);
        const elsewhere = await addCourse(db, other.id);

        await rejectsWith(addItem(db, plan.id, { plan_course_id: elsewhere.id }), "23503");
        const item = await addItem(db, plan.id, { plan_course_id: planned.id });

        await db.query("delete from public.plan_courses where id = $1", [planned.id]);
        const { rows } = await db.query("select plan_course_id from public.plan_items where id = $1", [item.id]);
        assert.deepEqual(rows, [{ plan_course_id: null }]);
      });
    });

    it("deletes a plan's items with the plan, including items linked to its courses", async () => {
      const plan = await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db);
        const planned = await addCourse(db, plan.id);
        await addItem(db, plan.id, { plan_course_id: planned.id });
        await addItem(db, plan.id);

        await db.query("delete from public.semester_plans where id = $1", [plan.id]);
        return plan;
      });

      const { rows } = await db.query("select count(*)::int as n from public.plan_items where plan_id = $1", [plan.id]);
      assert.equal(rows[0].n, 0);
    });

    it("hides items from other students, who cannot add, change or remove them", async () => {
      const { plan, item } = await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db);
        return { plan, item: await addItem(db, plan.id) };
      });

      await asUser(db, users.studentB, async () => {
        const read = await db.query("select id from public.plan_items where id = $1", [item.id]);
        assert.equal(read.rows.length, 0);
        await rejectsWith(addItem(db, plan.id), "42501");
        const changed = await db.query("update public.plan_items set title = 'Mine now' where id = $1 returning id", [item.id]);
        assert.equal(changed.rows.length, 0);
        const removed = await db.query("delete from public.plan_items where id = $1 returning id", [item.id]);
        assert.equal(removed.rows.length, 0);
      });

      const { rows } = await db.query("select title from public.plan_items where id = $1", [item.id]);
      assert.deepEqual(rows, [{ title: "Midterm" }]);
    });

    it("never lets an item move to another plan", async () => {
      await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db);
        const other = await createPlan(db);
        const item = await addItem(db, plan.id);
        await rejectsWith(db.query("update public.plan_items set plan_id = $1 where id = $2", [other.id, item.id]), "42501");
      });
    });

    it("caps a plan at 100 items", async () => {
      await asUser(db, users.studentB, async () => {
        const plan = await createPlan(db);
        await db.query(
          `insert into public.plan_items (plan_id, title, on_date)
           select $1, 'Item ' || n, date '2027-02-01' + (n % 60)
           from generate_series(1, 100) as n`,
          [plan.id],
        );
        await rejectsWith(addItem(db, plan.id), "54000");
      });
    });

    it("gives anonymous visitors nothing", async () => {
      await db.exec("set role anon;");
      try {
        await rejectsWith(db.query("select id from public.plan_items"), "42501");
        await rejectsWith(db.query("select event_id from public.going_events"), "42501");
      } finally {
        await db.exec("reset role;");
      }
    });
  });

  describe("going marks", () => {
    it("needs the event saved, and unsaving it removes the mark", async () => {
      const eventId = await createEvent(db);

      await asUser(db, users.studentA, async () => {
        await rejectsWith(markGoing(db, eventId), "23503");

        await saveEvent(db, eventId);
        const { rows } = await markGoing(db, eventId);
        assert.equal(rows[0].student_id, users.studentA);
        await rejectsWith(markGoing(db, eventId), "23505");

        await db.query("delete from public.saved_events where event_id = $1", [eventId]);
        const left = await db.query("select event_id from public.going_events where event_id = $1", [eventId]);
        assert.equal(left.rows.length, 0);
      });
    });

    it("keeps marks private and owned by the student who made them", async () => {
      const eventId = await createEvent(db);

      await asUser(db, users.studentA, async () => {
        await saveEvent(db, eventId);
        await markGoing(db, eventId);
      });

      await asUser(db, users.studentB, async () => {
        const read = await db.query("select event_id from public.going_events where event_id = $1", [eventId]);
        assert.equal(read.rows.length, 0);
        const removed = await db.query("delete from public.going_events where event_id = $1 returning event_id", [eventId]);
        assert.equal(removed.rows.length, 0);
        await rejectsWith(
          db.query("insert into public.going_events (student_id, event_id) values ($1, $2)", [users.studentA, eventId]),
          "42501",
        );
      });

      await asUser(db, users.studentA, async () => {
        const removed = await db.query("delete from public.going_events where event_id = $1 returning event_id", [eventId]);
        assert.equal(removed.rows.length, 1);
      });
    });
  });
});
