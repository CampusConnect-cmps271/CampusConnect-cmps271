import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// SCRUM-228 / SP3-44: semester plans, plan courses and manual meetings.
const migrationNames = [
  "20261017091812_create_courses.sql",
  "20261031140841_planner_semester_plans.sql",
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
  studentA: "70000000-0000-4000-8000-000000000001",
  studentB: "70000000-0000-4000-8000-000000000002",
};

// Synthetic catalogue rows, enough to reach the 12-course cap.
const courseIds = Array.from(
  { length: 14 },
  (_, index) => `71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

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

const OFFICIAL = { term: "Spring 2027", startsOn: "2027-01-13", endsOn: "2027-04-27" };

async function createPlan(db, term = OFFICIAL.term, startsOn = OFFICIAL.startsOn, endsOn = OFFICIAL.endsOn) {
  const result = await db.query(
    `insert into public.semester_plans (term, starts_on, ends_on)
     values ($1, $2, $3)
     returning *`,
    [term, startsOn, endsOn],
  );
  return result.rows[0];
}

async function addCourse(db, planId, courseId) {
  const result = await db.query(
    `insert into public.plan_courses (plan_id, course_id)
     values ($1, $2)
     returning *`,
    [planId, courseId],
  );
  return result.rows[0];
}

async function addMeeting(db, planCourseId, fields = {}) {
  const meeting = { weekday: 2, start: 570, end: 645, ...fields };
  const columns = ["plan_course_id", "weekday", "start_minute", "end_minute"];
  const values = [planCourseId, meeting.weekday, meeting.start, meeting.end];
  if (meeting.timezone !== undefined) {
    columns.push("timezone");
    values.push(meeting.timezone);
  }
  if (meeting.source !== undefined) {
    columns.push("source");
    values.push(meeting.source);
  }
  const result = await db.query(
    `insert into public.plan_meetings (${columns.join(", ")})
     values (${values.map((_, index) => `$${index + 1}`).join(", ")})
     returning *`,
    values,
  );
  return result.rows[0];
}

async function positions(db, planId) {
  const result = await db.query(
    `select course_id, position from public.plan_courses
     where plan_id = $1 order by position`,
    [planId],
  );
  return result.rows;
}

describe("SP3-44 private semester plans and the manual meeting contract", () => {
  let db;

  before(async () => {
    db = new PGlite();
    await db.exec(foundation);
    for (const migration of migrations) await db.exec(migration);

    for (const [index, id] of courseIds.entries()) {
      await db.query(
        `insert into public.courses (id, code, name, description, credits, department)
         values ($1, $2, $3, 'Synthetic course for planner tests.', $4, 'Testing')`,
        [id, `TEST ${101 + index}`, `Test course ${index + 1}`, index === 0 ? "3.25" : "3"],
      );
    }
  });

  after(async () => {
    await db?.close();
  });

  describe("semester plans", () => {
    it("lets a student create and read their own plan, owned by auth.uid()", async () => {
      const plan = await asUser(db, users.studentA, () => createPlan(db, "Fall 2026", "2026-08-31", "2026-12-04"));

      assert.equal(plan.student_id, users.studentA);
      assert.ok(plan.updated_at);

      await asUser(db, users.studentA, async () => {
        const { rows } = await db.query("select id from public.semester_plans where id = $1", [plan.id]);
        assert.equal(rows.length, 1);
      });
    });

    it("hides a plan from other students, who cannot delete it either", async () => {
      const plan = await asUser(db, users.studentA, () => createPlan(db, "Summer 2027", "2027-05-26", "2027-07-15"));

      await asUser(db, users.studentB, async () => {
        const read = await db.query("select id from public.semester_plans where id = $1", [plan.id]);
        assert.equal(read.rows.length, 0);

        const removed = await db.query("delete from public.semester_plans where id = $1 returning id", [plan.id]);
        assert.equal(removed.rows.length, 0);
      });

      const { rows } = await db.query("select id from public.semester_plans where id = $1", [plan.id]);
      assert.equal(rows.length, 1);
    });

    it("allows one plan per term per student", async () => {
      await asUser(db, users.studentB, async () => {
        await createPlan(db);
        await rejectsWith(createPlan(db), "23505");
      });
    });

    it("rejects terms outside the season-and-year pattern", async () => {
      await asUser(db, users.studentB, async () => {
        for (const term of ["Winter 2027", "spring 2027", "Spring 2036", "Spring 2024", "Spring  2027"]) {
          await rejectsWith(createPlan(db, term), "23514");
        }
      });
    });

    it("rejects an end date that is not after the start, or more than 200 days later", async () => {
      await asUser(db, users.studentB, async () => {
        await rejectsWith(createPlan(db, "Fall 2030", "2030-09-01", "2030-09-01"), "23514");
        await rejectsWith(createPlan(db, "Fall 2030", "2030-09-01", "2030-08-01"), "23514");
        // 201 days; exactly 200 is the longest allowed.
        await rejectsWith(createPlan(db, "Fall 2030", "2030-09-01", "2031-03-21"), "23514");
        const longest = await createPlan(db, "Fall 2030", "2030-09-01", "2031-03-20");
        assert.equal(longest.term, "Fall 2030");
      });
    });

    it("never lets a student choose the owner or change a plan's term or dates", async () => {
      await asUser(db, users.studentB, async () => {
        await rejectsWith(
          db.query(
            `insert into public.semester_plans (student_id, term, starts_on, ends_on)
             values ($1, 'Fall 2031', '2031-09-01', '2031-12-01')`,
            [users.studentA],
          ),
          "42501",
        );
        await rejectsWith(db.query("update public.semester_plans set ends_on = ends_on + 1"), "42501");
        await rejectsWith(db.query("update public.semester_plans set term = 'Fall 2032'"), "42501");
      });
    });

    it("caps a student at 10 plans", async () => {
      const studentC = "70000000-0000-4000-8000-000000000003";
      await db.query("insert into auth.users (id, email) values ($1, 'c@mail.aub.edu')", [studentC]);

      await asUser(db, studentC, async () => {
        for (let year = 2026; year < 2036; year++) await createPlan(db, `Fall ${year}`, `${year}-09-01`, `${year}-12-01`);
        await rejectsWith(createPlan(db, "Spring 2030", "2030-01-15", "2030-05-01"), "54000");
      });
    });

    it("keeps everything from anonymous visitors", async () => {
      await db.exec("set role anon");
      try {
        await rejectsWith(db.query("select id from public.semester_plans"), "42501");
        await rejectsWith(db.query("select id from public.plan_courses"), "42501");
        await rejectsWith(db.query("select id from public.plan_meetings"), "42501");
      } finally {
        await db.exec("reset role");
      }
    });
  });

  describe("plan courses", () => {
    let planId;

    before(async () => {
      const plan = await asUser(db, users.studentA, () => createPlan(db, "Spring 2028", "2028-01-12", "2028-04-26"));
      planId = plan.id;
    });

    it("adds courses at the end of the plan", async () => {
      await asUser(db, users.studentA, async () => {
        const first = await addCourse(db, planId, courseIds[0]);
        const second = await addCourse(db, planId, courseIds[1]);
        assert.equal(first.position, 1);
        assert.equal(second.position, 2);
      });
    });

    it("refuses the same course twice and unknown courses", async () => {
      await asUser(db, users.studentA, async () => {
        await rejectsWith(addCourse(db, planId, courseIds[0]), "23505");
        await rejectsWith(addCourse(db, planId, "71000000-0000-4000-8000-999999999999"), "23503");
      });
    });

    it("keeps another student out of the plan's courses", async () => {
      await asUser(db, users.studentB, async () => {
        const read = await db.query("select id from public.plan_courses where plan_id = $1", [planId]);
        assert.equal(read.rows.length, 0);

        await rejectsWith(addCourse(db, planId, courseIds[5]), "42501");

        const moved = await db.query("update public.plan_courses set position = 9 where plan_id = $1 returning id", [planId]);
        assert.equal(moved.rows.length, 0);

        const removed = await db.query("delete from public.plan_courses where plan_id = $1 returning id", [planId]);
        assert.equal(removed.rows.length, 0);
      });

      assert.equal((await positions(db, planId)).length, 2);
    });

    it("never moves a course into another plan or swaps the course", async () => {
      const otherPlan = await asUser(db, users.studentA, () => createPlan(db, "Summer 2028", "2028-05-24", "2028-07-13"));

      await asUser(db, users.studentA, async () => {
        await rejectsWith(
          db.query("update public.plan_courses set plan_id = $1 where plan_id = $2", [otherPlan.id, planId]),
          "42501",
        );
        await rejectsWith(
          db.query("update public.plan_courses set course_id = $1 where plan_id = $2", [courseIds[9], planId]),
          "42501",
        );
      });
    });

    it("blocks deleting a catalogue course that a plan uses", async () => {
      await rejectsWith(db.query("delete from public.courses where id = $1", [courseIds[0]]), "23001");
    });

    it("caps a plan at 12 courses", async () => {
      const plan = await asUser(db, users.studentB, () => createPlan(db, "Fall 2029", "2029-09-03", "2029-12-07"));

      await asUser(db, users.studentB, async () => {
        for (const courseId of courseIds.slice(0, 12)) await addCourse(db, plan.id, courseId);
        await rejectsWith(addCourse(db, plan.id, courseIds[12]), "54000");
      });
    });
  });

  describe("reorder_plan_courses", () => {
    let planId;

    before(async () => {
      planId = await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db, "Fall 2028", "2028-08-28", "2028-12-01");
        for (const courseId of courseIds.slice(0, 3)) await addCourse(db, plan.id, courseId);
        return plan.id;
      });
    });

    const reorder = (ids) =>
      db.query("select public.reorder_plan_courses($1, $2::uuid[])", [planId, ids]);

    it("sets positions 1..n in the order given", async () => {
      await asUser(db, users.studentA, () => reorder([courseIds[2], courseIds[0], courseIds[1]]));

      assert.deepEqual(
        (await positions(db, planId)).map((row) => [row.course_id, row.position]),
        [[courseIds[2], 1], [courseIds[0], 2], [courseIds[1], 3]],
      );
    });

    it("rejects missing, extra, repeated or foreign ids", async () => {
      await asUser(db, users.studentA, async () => {
        await rejectsWith(reorder([courseIds[0], courseIds[1]]), "22023");
        await rejectsWith(reorder([courseIds[0], courseIds[1], courseIds[2], courseIds[3]]), "22023");
        await rejectsWith(reorder([courseIds[0], courseIds[0], courseIds[1]]), "22023");
        await rejectsWith(reorder([courseIds[0], courseIds[1], courseIds[10]]), "22023");
        await rejectsWith(reorder([]), "22023");
      });

      assert.deepEqual(
        (await positions(db, planId)).map((row) => row.course_id),
        [courseIds[2], courseIds[0], courseIds[1]],
      );
    });

    it("treats another student's plan as not found", async () => {
      await asUser(db, users.studentB, async () => {
        await rejectsWith(reorder([courseIds[0], courseIds[1], courseIds[2]]), "P0002");
      });
    });

    it("is not available to anonymous visitors", async () => {
      await db.exec("set role anon");
      try {
        await rejectsWith(reorder([courseIds[0], courseIds[1], courseIds[2]]), "42501");
      } finally {
        await db.exec("reset role");
      }
    });
  });

  describe("plan meetings", () => {
    let planId;
    let planCourseId;

    before(async () => {
      [planId, planCourseId] = await asUser(db, users.studentA, async () => {
        const plan = await createPlan(db, "Spring 2029", "2029-01-15", "2029-04-30");
        const planCourse = await addCourse(db, plan.id, courseIds[4]);
        return [plan.id, planCourse.id];
      });
    });

    it("stores a manual meeting in Asia/Beirut by default", async () => {
      const meeting = await asUser(db, users.studentA, () => addMeeting(db, planCourseId));

      assert.equal(meeting.timezone, "Asia/Beirut");
      assert.equal(meeting.source, "manual");
      assert.equal(meeting.weekday, 2);
    });

    it("accepts any valid IANA zone at the database level", async () => {
      const meeting = await asUser(db, users.studentA, () =>
        addMeeting(db, planCourseId, { weekday: 3, timezone: "Europe/London" }),
      );
      assert.equal(meeting.timezone, "Europe/London");
    });

    it("rejects invalid weekdays, times, zones and sources", async () => {
      await asUser(db, users.studentA, async () => {
        await rejectsWith(addMeeting(db, planCourseId, { weekday: 0 }), "23514");
        await rejectsWith(addMeeting(db, planCourseId, { weekday: 8 }), "23514");
        await rejectsWith(addMeeting(db, planCourseId, { start: 600, end: 600 }), "23514");
        await rejectsWith(addMeeting(db, planCourseId, { start: 700, end: 600 }), "23514");
        await rejectsWith(addMeeting(db, planCourseId, { start: 1400, end: 1441 }), "23514");
        await rejectsWith(addMeeting(db, planCourseId, { start: -1, end: 60 }), "23514");
        await rejectsWith(addMeeting(db, planCourseId, { timezone: "Mars/Olympus_Mons" }), "22023");
        await rejectsWith(addMeeting(db, planCourseId, { timezone: "Beirut" }), "22023");
        await rejectsWith(addMeeting(db, planCourseId, { source: "aub_timetable" }), "23514");
      });
    });

    it("refuses a duplicate meeting and caps a course at 7", async () => {
      await asUser(db, users.studentA, async () => {
        await rejectsWith(addMeeting(db, planCourseId), "23505");

        for (let weekday = 4; weekday <= 7; weekday++) await addMeeting(db, planCourseId, { weekday });
        await addMeeting(db, planCourseId, { weekday: 1, start: 480, end: 530 });
        // Seven meetings now: Tue, Wed (London), Thu-Sun and Mon.
        await rejectsWith(addMeeting(db, planCourseId, { weekday: 1, start: 600, end: 650 }), "54000");
      });
    });

    it("lets the owner edit a meeting, which refreshes updated_at", async () => {
      await asUser(db, users.studentA, async () => {
        const { rows: [before] } = await db.query(
          "select id, updated_at from public.plan_meetings where plan_course_id = $1 and weekday = 2",
          [planCourseId],
        );
        await db.exec("select pg_sleep(0.01)");
        const { rows: [edited] } = await db.query(
          "update public.plan_meetings set start_minute = 540 where id = $1 returning start_minute, updated_at",
          [before.id],
        );
        assert.equal(edited.start_minute, 540);
        assert.ok(new Date(edited.updated_at) > new Date(before.updated_at));

        await rejectsWith(
          db.query("update public.plan_meetings set end_minute = 500 where id = $1", [before.id]),
          "23514",
        );
        await rejectsWith(
          db.query("update public.plan_meetings set timezone = 'Not/AZone' where id = $1", [before.id]),
          "22023",
        );
      });
    });

    it("never moves a meeting to another course", async () => {
      const otherPlanCourseId = await asUser(db, users.studentA, async () => (await addCourse(db, planId, courseIds[5])).id);

      await asUser(db, users.studentA, async () => {
        await rejectsWith(
          db.query("update public.plan_meetings set plan_course_id = $1 where plan_course_id = $2", [otherPlanCourseId, planCourseId]),
          "42501",
        );
        await rejectsWith(
          db.query("update public.plan_meetings set source = 'manual' where plan_course_id = $1", [planCourseId]),
          "42501",
        );
      });
    });

    it("keeps another student out of the meetings", async () => {
      await asUser(db, users.studentB, async () => {
        const read = await db.query("select id from public.plan_meetings where plan_course_id = $1", [planCourseId]);
        assert.equal(read.rows.length, 0);

        await rejectsWith(addMeeting(db, planCourseId, { weekday: 6, start: 60, end: 120 }), "42501");

        const edited = await db.query("update public.plan_meetings set start_minute = 0 where plan_course_id = $1 returning id", [planCourseId]);
        assert.equal(edited.rows.length, 0);

        const removed = await db.query("delete from public.plan_meetings where plan_course_id = $1 returning id", [planCourseId]);
        assert.equal(removed.rows.length, 0);
      });

      const { rows } = await db.query("select count(*)::int as n from public.plan_meetings where plan_course_id = $1", [planCourseId]);
      assert.equal(rows[0].n, 7);
    });

    it("deletes a plan's courses and meetings with the plan", async () => {
      await asUser(db, users.studentA, async () => {
        const { rows } = await db.query("delete from public.semester_plans where id = $1 returning id", [planId]);
        assert.equal(rows.length, 1);
      });

      const courses = await db.query("select id from public.plan_courses where plan_id = $1", [planId]);
      const meetings = await db.query("select id from public.plan_meetings where plan_course_id = $1", [planCourseId]);
      assert.equal(courses.rows.length, 0);
      assert.equal(meetings.rows.length, 0);
    });
  });
});
