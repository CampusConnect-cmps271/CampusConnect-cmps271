import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// SCRUM-243: planner class times from AUB's imported (Resis) schedule.
// Linking a plan to an imported semester, choosing sections through
// planner_choose_sections, RLS against forged section times, and what the
// plan page reports when a newer snapshot changes a section.
//
// Every course, CRN and time below is synthetic test data, not AUB's schedule.

async function readMigration(name) {
  const sql = await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
  return sql.replace(/^﻿/, "");
}

const users = {
  studentA: "75000000-0000-4000-8000-000000000001",
  studentB: "75000000-0000-4000-8000-000000000002",
};

const ids = {
  spring: "75000000-0000-4000-a000-000000000001",
  springNext: "75000000-0000-4000-a000-000000000002",
  fall: "75000000-0000-4000-a000-000000000003",
  noImport: "75000000-0000-4000-a000-000000000004",
};

// Supabase's defaults: new tables and functions are granted to the API roles,
// so a migration that forgets to revoke shows up here.
const foundation = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  insert into auth.users (id, email) values
    ('${users.studentA}', 'a@mail.aub.edu'),
    ('${users.studentB}', 'b@mail.aub.edu');
`;

/** A section as the Resis importer stores it, trimmed to what the planner reads. */
function section(crn, number, sessions, extra = {}) {
  return { crn, section: number, title: "Synthetic course", sessions, connected_crns: [], connected_labels: [], ...extra };
}
const session = (days, start, end, type = "Lecture") => ({ days, start, end, type, location: "Test Hall", instructor: "Test Instructor" });

let db;
const course = {};

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

/** Stores one import's offerings: { code: sections[] }. */
async function storeImport(importId, semesterId, fetchedAt, offerings) {
  await db.query("insert into public.resis_imports (id, semester_id, fetched_at, expected_courses) values ($1, $2, $3, $4)", [
    importId,
    semesterId,
    fetchedAt,
    Object.keys(offerings).length,
  ]);
  for (const [code, sections] of Object.entries(offerings)) {
    await db.query(
      `insert into public.course_offerings (import_id, course_id, title, credits, sections)
       values ($1, $2, 'Synthetic course', 3, $3::jsonb)`,
      [importId, course[code], JSON.stringify(sections)],
    );
  }
}

const activate = (semesterId, importId) =>
  db.query("update public.resis_semesters set active_import_id = $2, synced_at = now() where id = $1", [semesterId, importId]);

const springSections = () => ({
  "PLN 201": [
    section("30001", "1", [session("MWF", "09:00", "09:50")]),
    section("30002", "2", [session("TR", "11:00", "12:15")], { connected_crns: ["30003"] }),
    // Its recitation: same course, linked to section 2.
    section("30003", "E1", [session("W", "16:00", "16:50", "Recitation")], { connected_crns: ["30002"] }),
    section("30004", "3", [session("", "TBA", "TBA")]),
  ],
  "PLN 202": [
    section("30010", "1", [session("MW", "14:00", "15:15")], { connected_crns: ["30020"] }),
    section("30011", "2", [session("T", "08:00", "09:15"), session("T", "08:00", "09:15")]),
  ],
  // Another course whose lab section 1 of PLN 202 lists (and section 2 doesn't).
  "PLN 203": [section("30020", "L1", [session("R", "14:00", "16:00", "Lab")]), section("30021", "L2", [session("F", "14:00", "16:00", "Lab")])],
  // Fifteen weekly rows in one section: over the cap of 14.
  "PLN 204": [
    section("30030", "1", [
      session("MTWRFS", "08:00", "08:50"),
      session("MTWRFS", "10:00", "10:50"),
      session("MTW", "12:00", "12:50"),
    ]),
  ],
});

async function createPlan(term) {
  return (await db.query("insert into public.semester_plans (term, starts_on, ends_on) values ($1, '2027-01-13', '2027-04-27') returning *", [term]))
    .rows[0];
}

async function addCourse(planId, code) {
  return (await db.query("insert into public.plan_courses (plan_id, course_id) values ($1, $2) returning *", [planId, course[code]])).rows[0];
}

const choose = (planCourseId, crns) => db.query("select public.planner_choose_sections($1, $2::text[]) as written", [planCourseId, crns]);

const meetingsOf = async (planCourseId) =>
  (
    await db.query(
      "select weekday, start_minute, end_minute, timezone, source, crn from public.plan_meetings where plan_course_id = $1 order by crn, weekday, start_minute",
      [planCourseId],
    )
  ).rows;

before(async () => {
  db = new PGlite();
  await db.exec(foundation);
  await db.exec(await readMigration("20261017091812_create_courses.sql"));
  // The catalogue view in the Resis migration reads the ratings view; stub it.
  await db.exec(`create view public.course_rating_averages with (security_invoker = true) as
    select id as course_id, 0::bigint as review_count, null::numeric as average_difficulty, null::numeric as average_workload from public.courses;`);
  await db.exec(await readMigration("20261108193027_resis_semester_catalogue.sql"));
  await db.exec(await readMigration("20261031140841_planner_semester_plans.sql"));

  for (const code of ["PLN 201", "PLN 202", "PLN 203", "PLN 204", "PLN 299"]) {
    const row = await db.query(
      `insert into public.courses (code, name, description, credits, department, prerequisites)
       values ($1, 'Synthetic course', 'Test only', 3, 'Planning', '') returning id`,
      [code],
    );
    course[code] = row.rows[0].id;
  }
  await db.exec(`insert into public.resis_semesters (id, name) values
    ('202720', 'Spring 2026-2027'), ('202710', 'Fall 2026-2027'), ('202730', 'Summer 2026-2027');`);
  await storeImport(ids.spring, "202720", "2026-11-08T19:00:00Z", springSections());
  await activate("202720", ids.spring);
  await storeImport(ids.fall, "202710", "2026-11-08T19:00:00Z", { "PLN 201": [section("31001", "1", [session("M", "09:00", "09:50")])] });
  await activate("202710", ids.fall);

  // A plan from before the migration, to be linked by its backfill.
  await asUser(users.studentB, () => createPlan("Fall 2026"));

  await db.exec(await readMigration("20261116161014_planner_resis_sections.sql"));
});

after(async () => {
  await db?.close();
});

describe("term to semester mapping", () => {
  it("names the Resis semester for each planner term, in one SQL function", async () => {
    const cases = [
      ["Fall 2026", "Fall 2026-2027"],
      ["Spring 2027", "Spring 2026-2027"],
      ["Summer 2027", "Summer 2026-2027"],
      ["Fall 2029", "Fall 2029-2030"],
      ["Winter 2027", null],
      ["Spring 27", null],
    ];
    for (const [term, name] of cases) {
      const { rows } = await db.query("select public.planner_resis_semester_name($1) as name", [term]);
      assert.equal(rows[0].name, name, term);
    }
  });
});

describe("linking a plan to an imported semester", () => {
  it("links a new plan when exactly one imported semester matches its term", async () => {
    await asUser(users.studentA, async () => {
      const spring = await createPlan("Spring 2027");
      assert.equal(spring.resis_semester_id, "202720");
      // Summer 2026-2027 has no active import, so nothing matches.
      const summer = await createPlan("Summer 2027");
      assert.equal(summer.resis_semester_id, null);
    });
  });

  it("backfilled plans that existed before the migration", async () => {
    const { rows } = await db.query("select resis_semester_id from public.semester_plans where student_id = $1 and term = 'Fall 2026'", [
      users.studentB,
    ]);
    assert.equal(rows[0].resis_semester_id, "202710");
  });

  it("lets the student pick or clear the link on their own plan", async () => {
    await asUser(users.studentA, async () => {
      const plan = (await db.query("select id from public.semester_plans where term = 'Summer 2027'")).rows[0];
      await db.query("update public.semester_plans set resis_semester_id = '202720' where id = $1", [plan.id]);
      assert.equal((await db.query("select resis_semester_id from public.semester_plans where id = $1", [plan.id])).rows[0].resis_semester_id, "202720");
      await db.query("update public.semester_plans set resis_semester_id = null where id = $1", [plan.id]);
      assert.equal((await db.query("select resis_semester_id from public.semester_plans where id = $1", [plan.id])).rows[0].resis_semester_id, null);
    });
  });

  it("refuses a semester with no active import", async () => {
    await asUser(users.studentA, async () => {
      const plan = (await db.query("select id from public.semester_plans where term = 'Summer 2027'")).rows[0];
      await rejectsWith(db.query("update public.semester_plans set resis_semester_id = '202730' where id = $1", [plan.id]), "42501");
    });
  });

  it("lets a student change only the link, and only on their own plans", async () => {
    const plan = (await db.query("select id from public.semester_plans where student_id = $1 and term = 'Spring 2027'", [users.studentA])).rows[0];
    await asUser(users.studentB, async () => {
      const changed = await db.query("update public.semester_plans set resis_semester_id = null where id = $1 returning id", [plan.id]);
      assert.equal(changed.rows.length, 0);
    });
    await asUser(users.studentA, async () => {
      await rejectsWith(db.query("update public.semester_plans set starts_on = '2027-01-01' where id = $1", [plan.id]), "42501");
    });
    assert.equal((await db.query("select resis_semester_id from public.semester_plans where id = $1", [plan.id])).rows[0].resis_semester_id, "202720");
  });
});

describe("choosing sections", () => {
  let plan;
  const planned = {};

  before(async () => {
    await asUser(users.studentA, async () => {
      plan = (await db.query("select * from public.semester_plans where term = 'Spring 2027'")).rows[0];
      for (const code of ["PLN 201", "PLN 202", "PLN 204", "PLN 299"]) planned[code] = await addCourse(plan.id, code);
    });
  });

  it("fills in one Beirut row per weekday from the snapshot: MWF gives three", async () => {
    await asUser(users.studentA, async () => {
      assert.equal((await choose(planned["PLN 201"].id, ["30001"])).rows[0].written, 3);
      assert.deepEqual(await meetingsOf(planned["PLN 201"].id), [
        { weekday: 1, start_minute: 540, end_minute: 590, timezone: "Asia/Beirut", source: "resis", crn: "30001" },
        { weekday: 3, start_minute: 540, end_minute: 590, timezone: "Asia/Beirut", source: "resis", crn: "30001" },
        { weekday: 5, start_minute: 540, end_minute: 590, timezone: "Asia/Beirut", source: "resis", crn: "30001" },
      ]);
      const links = (await db.query("select crn, section, semester_id, import_id from public.plan_course_sections where plan_course_id = $1", [planned["PLN 201"].id])).rows;
      assert.deepEqual(links, [{ crn: "30001", section: "1", semester_id: "202720", import_id: ids.spring }]);
    });
  });

  it("gives no rows for a TBA section, so the course shows as unknown", async () => {
    await asUser(users.studentA, async () => {
      assert.equal((await choose(planned["PLN 201"].id, ["30004"])).rows[0].written, 0);
      assert.deepEqual(await meetingsOf(planned["PLN 201"].id), []);
      assert.equal((await db.query("select count(*)::int as n from public.plan_course_sections where plan_course_id = $1", [planned["PLN 201"].id])).rows[0].n, 1);
    });
  });

  it("takes a section with its linked recitation, and de-duplicates identical rows", async () => {
    await asUser(users.studentA, async () => {
      assert.equal((await choose(planned["PLN 201"].id, ["30002", "30003"])).rows[0].written, 3);
      const rows = await meetingsOf(planned["PLN 201"].id);
      assert.deepEqual(rows.map((row) => [row.crn, row.weekday]), [["30002", 2], ["30002", 4], ["30003", 3]]);
      // Section 2 of PLN 202 lists the same Tuesday session twice: one row.
      assert.equal((await choose(planned["PLN 202"].id, ["30011"])).rows[0].written, 1);
    });
  });

  it("allows another course's CRN only when a chosen section lists it", async () => {
    await asUser(users.studentA, async () => {
      assert.equal((await choose(planned["PLN 202"].id, ["30010", "30020"])).rows[0].written, 3);
      // Section 2 of PLN 202 doesn't list PLN 203's lab.
      await rejectsWith(choose(planned["PLN 202"].id, ["30011", "30020"]), "22023");
      // Listed, but L2 isn't the listed lab.
      await rejectsWith(choose(planned["PLN 202"].id, ["30010", "30021"]), "22023");
    });
  });

  it("refuses a CRN from another course, an unknown CRN and a malformed one", async () => {
    await asUser(users.studentA, async () => {
      await rejectsWith(choose(planned["PLN 201"].id, ["30010"]), "22023");
      await rejectsWith(choose(planned["PLN 201"].id, ["99999"]), "22023");
      await rejectsWith(choose(planned["PLN 201"].id, ["30001", "3000a"]), "22023");
      await rejectsWith(choose(planned["PLN 299"].id, ["30001"]), "22023");
    });
  });

  it("refuses a CRN that is only in an inactive snapshot", async () => {
    // A newer import, staged but not activated.
    await storeImport(ids.springNext, "202720", "2026-11-20T19:00:00Z", {
      "PLN 201": [section("30001", "1", [session("MWF", "09:00", "09:50")]), section("30099", "9", [session("M", "18:00", "18:50")])],
    });
    await asUser(users.studentA, async () => {
      await rejectsWith(choose(planned["PLN 201"].id, ["30099"]), "22023");
    });
  });

  it("caps sections at 4 a course and section rows at 14", async () => {
    await asUser(users.studentA, async () => {
      await rejectsWith(choose(planned["PLN 201"].id, ["30001", "30002", "30003", "30004", "30005"]), "54000");
      await rejectsWith(choose(planned["PLN 204"].id, ["30030"]), "54000");
      assert.deepEqual(await meetingsOf(planned["PLN 204"].id), []);
    });
  });

  it("clears a course's sections, and their rows, with an empty array", async () => {
    await asUser(users.studentA, async () => {
      await choose(planned["PLN 201"].id, ["30001"]);
      assert.equal((await choose(planned["PLN 201"].id, [])).rows[0].written, 0);
      assert.deepEqual(await meetingsOf(planned["PLN 201"].id), []);
      assert.equal((await db.query("select count(*)::int as n from public.plan_course_sections where plan_course_id = $1", [planned["PLN 201"].id])).rows[0].n, 0);
    });
  });

  it("refuses sections on a plan that isn't linked to an imported semester", async () => {
    await asUser(users.studentA, async () => {
      const summer = (await db.query("select id from public.semester_plans where term = 'Summer 2027'")).rows[0];
      const summerCourse = await addCourse(summer.id, "PLN 201");
      await rejectsWith(choose(summerCourse.id, ["30001"]), "55000");
      // Clearing is always allowed.
      assert.equal((await choose(summerCourse.id, [])).rows[0].written, 0);
    });
  });
});

describe("typed times and sections don't mix", () => {
  it("removes typed meetings when sections are chosen, and refuses typed ones while sections are set", async () => {
    await asUser(users.studentA, async () => {
      const plan = (await db.query("select id from public.semester_plans where term = 'Spring 2027'")).rows[0];
      const planned = await addCourse(plan.id, "PLN 203");
      await db.query("insert into public.plan_meetings (plan_course_id, weekday, start_minute, end_minute) values ($1, 2, 600, 675)", [planned.id]);
      await choose(planned.id, ["30021"]);
      assert.deepEqual((await meetingsOf(planned.id)).map((row) => row.source), ["resis"]);
      await rejectsWith(
        db.query("insert into public.plan_meetings (plan_course_id, weekday, start_minute, end_minute) values ($1, 2, 600, 675)", [planned.id]),
        "55000",
      );
      // Back to typed times: clear the sections first.
      await choose(planned.id, []);
      await db.query("insert into public.plan_meetings (plan_course_id, weekday, start_minute, end_minute) values ($1, 2, 600, 675)", [planned.id]);
      assert.deepEqual((await meetingsOf(planned.id)).map((row) => row.source), ["manual"]);
    });
  });
});

describe("section times can't be forged", () => {
  let planned;

  before(async () => {
    await asUser(users.studentA, async () => {
      const plan = (await db.query("select id from public.semester_plans where term = 'Spring 2027'")).rows[0];
      planned = (await db.query("select id from public.plan_courses where plan_id = $1 and course_id = $2", [plan.id, course["PLN 201"]])).rows[0];
      await choose(planned.id, ["30001"]);
    });
  });

  it("refuses a direct insert of a section row, or a typed row with a CRN", async () => {
    await asUser(users.studentA, async () => {
      await rejectsWith(
        db.query("insert into public.plan_meetings (plan_course_id, weekday, start_minute, end_minute, source) values ($1, 2, 600, 675, 'resis')", [planned.id]),
        "42501",
      );
      await rejectsWith(
        db.query("insert into public.plan_meetings (plan_course_id, weekday, start_minute, end_minute, crn) values ($1, 2, 600, 675, '30001')", [planned.id]),
        "42501",
      );
    });
  });

  it("can't edit a section row's times, though the student may delete it", async () => {
    await asUser(users.studentA, async () => {
      const edited = await db.query("update public.plan_meetings set start_minute = 0 where plan_course_id = $1 and source = 'resis' returning id", [planned.id]);
      assert.equal(edited.rows.length, 0);
      await rejectsWith(db.query("update public.plan_meetings set crn = '30002' where plan_course_id = $1", [planned.id]), "42501");
      await rejectsWith(db.query("update public.plan_meetings set source = 'manual' where plan_course_id = $1", [planned.id]), "42501");
      const removed = await db.query("delete from public.plan_meetings where plan_course_id = $1 and weekday = 5 returning id", [planned.id]);
      assert.equal(removed.rows.length, 1);
      await choose(planned.id, ["30001"]);
    });
  });

  it("never lets a student write section links", async () => {
    await asUser(users.studentA, async () => {
      await rejectsWith(
        db.query("insert into public.plan_course_sections (plan_course_id, crn, section, semester_id, import_id) values ($1, '30002', '2', '202720', $2)", [planned.id, ids.spring]),
        "42501",
      );
      await rejectsWith(db.query("delete from public.plan_course_sections where plan_course_id = $1", [planned.id]), "42501");
    });
  });

  it("refuses another student's call on my planned course, and anyone signed out", async () => {
    await asUser(users.studentB, async () => {
      await rejectsWith(choose(planned.id, ["30002"]), "42501");
      await rejectsWith(choose(planned.id, []), "42501");
      assert.equal((await db.query("select count(*)::int as n from public.plan_course_sections")).rows[0].n, 0);
      assert.equal((await db.query("select count(*)::int as n from public.planner_section_changes($1)", [planned.plan_id])).rows[0].n, 0);
    });
    await db.exec("set role anon");
    try {
      await rejectsWith(choose(planned.id, []), "42501");
    } finally {
      await db.exec("reset role");
    }
    assert.equal((await meetingsOf(planned.id)).length, 3);
  });
});

describe("when a newer snapshot is activated", () => {
  let plan;
  const planned = {};
  const changes = async () =>
    (await db.query("select plan_course_id, crn, section, status from public.planner_section_changes($1) order by crn", [plan.id])).rows;

  before(async () => {
    await asUser(users.studentA, async () => {
      plan = (await db.query("select id from public.semester_plans where term = 'Spring 2027'")).rows[0];
      for (const code of ["PLN 201", "PLN 202"]) {
        planned[code] = (await db.query("select id from public.plan_courses where plan_id = $1 and course_id = $2", [plan.id, course[code]])).rows[0];
      }
      await choose(planned["PLN 201"].id, ["30002", "30003"]);
      await choose(planned["PLN 202"].id, ["30011"]);
      assert.deepEqual(await changes(), []);
    });
  });

  it("changes nothing in the plan, and reports changed and removed sections", async () => {
    // Section 2 moves to 12:30; its recitation keeps its time; PLN 202 section 2 is gone.
    await db.query("delete from public.course_offerings where import_id = $1", [ids.springNext]);
    await db.query("update public.resis_imports set expected_courses = 2 where id = $1", [ids.springNext]);
    for (const [code, sections] of Object.entries({
      "PLN 201": [
        section("30002", "2", [session("TR", "12:30", "13:45")], { connected_crns: ["30003"] }),
        section("30003", "E1", [session("W", "16:00", "16:50", "Recitation")], { connected_crns: ["30002"] }),
      ],
      "PLN 202": [section("30010", "1", [session("MW", "14:00", "15:15")])],
    })) {
      await db.query(
        "insert into public.course_offerings (import_id, course_id, title, credits, sections) values ($1, $2, 'Synthetic course', 3, $3::jsonb)",
        [ids.springNext, course[code], JSON.stringify(sections)],
      );
    }
    await activate("202720", ids.springNext);

    await asUser(users.studentA, async () => {
      assert.deepEqual(await changes(), [
        { plan_course_id: planned["PLN 201"].id, crn: "30002", section: "2", status: "changed" },
        { plan_course_id: planned["PLN 202"].id, crn: "30011", section: "2", status: "gone" },
      ]);
      // Untouched until the student acts.
      assert.deepEqual((await meetingsOf(planned["PLN 201"].id)).filter((row) => row.crn === "30002").map((row) => row.start_minute), [660, 660]);
    });
  });

  it("applies the new times when the student updates with the same CRNs", async () => {
    await asUser(users.studentA, async () => {
      await choose(planned["PLN 201"].id, ["30002", "30003"]);
      assert.deepEqual((await meetingsOf(planned["PLN 201"].id)).filter((row) => row.crn === "30002").map((row) => row.start_minute), [750, 750]);
      assert.deepEqual((await changes()).map((row) => row.status), ["gone"]);
      // "Use typed times" on the removed section.
      await choose(planned["PLN 202"].id, []);
      assert.deepEqual(await changes(), []);
    });
  });

  it("reports nothing for another student's plan", async () => {
    await asUser(users.studentB, async () => {
      assert.deepEqual(await changes(), []);
    });
  });
});

describe("what the campus assistant reads", () => {
  it("returns section times with their source and CRN through semester_plans → plan_courses → plan_meetings", async () => {
    await asUser(users.studentA, async () => {
      const { rows } = await db.query(
        `select p.term, c.code, m.weekday, m.start_minute, m.end_minute, m.timezone, m.source, m.crn
         from public.semester_plans p
         join public.plan_courses pc on pc.plan_id = p.id
         join public.courses c on c.id = pc.course_id
         join public.plan_meetings m on m.plan_course_id = pc.id
         where p.term = 'Spring 2027' and c.code = 'PLN 201'
         order by m.weekday`,
      );
      assert.deepEqual(rows.map((row) => [row.weekday, row.start_minute, row.end_minute, row.timezone, row.source, row.crn]), [
        [2, 750, 825, "Asia/Beirut", "resis", "30002"],
        [3, 960, 1010, "Asia/Beirut", "resis", "30003"],
        [4, 750, 825, "Asia/Beirut", "resis", "30002"],
      ]);
    });
  });
});

describe("grants", () => {
  it("gives anon nothing and keeps the helpers off the API", async () => {
    const { rows } = await db.query(`
      select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authed,
             p.prosecdef as definer, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'planner_%' and p.proname <> 'planner_check_meeting'
        and p.proname not in ('planner_touch_updated_at', 'planner_limit_plans', 'planner_prepare_plan_course')
      order by p.proname`);
    for (const row of rows) {
      assert.equal(row.anon, false, `${row.proname} is executable by anon`);
      assert.deepEqual(row.proconfig, ["search_path=\"\""], `${row.proname} search_path`);
    }
    const byName = Object.fromEntries(rows.map((row) => [row.proname, row]));
    assert.equal(byName.planner_choose_sections.definer, true);
    assert.equal(byName.planner_choose_sections.authed, true);
    assert.equal(byName.planner_link_new_plan.authed, false);
    for (const name of ["planner_section_changes", "planner_offered_sections", "planner_section_rows", "planner_matching_resis_semester"]) {
      assert.equal(byName[name].definer, false, `${name} should run as the caller`);
    }
    const tablePrivileges = await db.query(`
      select has_table_privilege('anon', 'public.plan_course_sections', 'select') as anon_read,
             has_table_privilege('authenticated', 'public.plan_course_sections', 'insert') as student_insert,
             has_table_privilege('authenticated', 'public.plan_course_sections', 'select') as student_read,
             has_column_privilege('authenticated', 'public.plan_meetings', 'crn', 'insert') as crn_insert,
             has_column_privilege('authenticated', 'public.plan_meetings', 'crn', 'update') as crn_update,
             has_column_privilege('authenticated', 'public.semester_plans', 'resis_semester_id', 'update') as link_update,
             has_column_privilege('authenticated', 'public.semester_plans', 'term', 'update') as term_update`);
    assert.deepEqual(tablePrivileges.rows[0], {
      anon_read: false,
      student_insert: false,
      student_read: true,
      crn_insert: false,
      crn_update: false,
      link_update: true,
      term_update: false,
    });
  });

  it("counts offered sections per course in the linked semester's active snapshot", async () => {
    await asUser(users.studentA, async () => {
      const { rows } = await db.query("select course_id, section_count from public.planner_offered_sections('202720', $1::uuid[]) order by section_count", [
        [course["PLN 201"], course["PLN 202"], course["PLN 299"]],
      ]);
      assert.deepEqual(rows, [
        { course_id: course["PLN 202"], section_count: 1 },
        { course_id: course["PLN 201"], section_count: 2 },
      ]);
    });
  });
});
