import { courses } from "./mock-courses.mjs";

// Test-only stand-in for what /calendar (SCRUM-244/245) and its students' plan
// page read: a Spring 2027 plan linked to the imported Spring 2026-2027
// semester, with a chosen section and its recitation, an item of their own,
// and saved events (one going with a reminder, one saved only, one
// cancelled). Synthetic data, not AUB's schedule or real events. It answers
// only for the calendar students below, so other tests never see it, and each
// student has their own copy, since one test changes a going mark.
export const calendarTestAccounts = {
  "calendar-lina@mail.aub.edu": "00000000-0000-4000-8000-000000000401",
  "calendar-going@mail.aub.edu": "00000000-0000-4000-8000-000000000402",
  "calendar-omar@mail.aub.edu": "00000000-0000-4000-8000-000000000403",
};
const EMPTY_STUDENT = calendarTestAccounts["calendar-omar@mail.aub.edu"];

const SEMESTER = { id: "202720", name: "Spring 2026-2027", synced_at: "2026-11-08T00:00:00Z", active_import_id: "00000000-0000-4000-a000-000000202720" };
const math202 = courses.find((course) => course.code === "MATH 202");

// MATH 202 section 2 (Tue and Thu 11:00-12:15) and its recitation E1 (Wed 16:00-16:50), Beirut.
const SECTIONS = [
  {
    crn: "95012",
    section: "2",
    sessions: [{ days: "TR", start: "11:00", end: "12:15", type: "Lecture", location: "Test Hall 201", instructor: "Test Instructor" }],
    connected_crns: ["95013"],
  },
  {
    crn: "95013",
    section: "E1",
    sessions: [{ days: "W", start: "16:00", end: "16:50", type: "Recitation", location: "Test Hall 202", instructor: "Test Assistant" }],
    connected_crns: ["95012"],
  },
];

/** One student's calendar, freshly made. */
function fixture(studentId) {
  const tag = studentId.slice(-3);
  const planId = `00000000-0000-4000-9000-000000000${tag}`;
  const planCourseId = `00000000-0000-4000-9100-000000000${tag}`;
  const meeting = (n, weekday, start, end, crn) => ({
    id: `00000000-0000-4000-920${n}-000000000${tag}`,
    plan_course_id: planCourseId,
    weekday,
    start_minute: start,
    end_minute: end,
    timezone: "Asia/Beirut",
    source: "resis",
    crn,
  });
  const event = (n, title, starts_at, ends_at, status = "published") => ({
    id: `00000000-0000-4000-930${n}-000000000${tag}`,
    title,
    starts_at,
    ends_at,
    location: "West Hall",
    status,
  });
  const talk = event(1, "Robotics club talk", "2027-02-16T09:30:00+00:00", "2027-02-16T10:30:00+00:00");
  const fair = event(2, "Career fair", "2027-02-18T09:30:00+00:00", "2027-02-18T10:00:00+00:00");
  const gala = event(3, "Spring gala", "2027-02-17T16:00:00+00:00", "2027-02-17T18:00:00+00:00", "cancelled");
  return {
    plan: {
      id: planId,
      student_id: studentId,
      term: "Spring 2027",
      starts_on: "2027-01-13",
      ends_on: "2027-04-27",
      resis_semester_id: SEMESTER.id,
      resis_semesters: { id: SEMESTER.id, name: SEMESTER.name, synced_at: SEMESTER.synced_at },
      plan_courses: [
        {
          id: planCourseId,
          course_id: math202.id,
          position: 1,
          courses: { code: math202.code, name: math202.name, credits: math202.credits },
          plan_meetings: [meeting(1, 2, 660, 735, "95012"), meeting(2, 4, 660, 735, "95012"), meeting(3, 3, 960, 1010, "95013")],
          plan_course_sections: [
            { crn: "95012", section: "2", semester_id: SEMESTER.id },
            { crn: "95013", section: "E1", semester_id: SEMESTER.id },
          ],
        },
      ],
      plan_items: [
        { id: `00000000-0000-4000-9400-000000000${tag}`, plan_id: planId, plan_course_id: null, title: "Office hours", on_date: "2027-02-17", start_minute: 600, end_minute: 630 },
      ],
    },
    saved: [
      // Going, with a reminder an hour before: Tue 16 Feb 11:30-12:30, during the 11:00 class.
      { event: talk, going: true, reminder_enabled: true, reminder_minutes_before: 60 },
      // Saved only, during Thursday's class: a quiet note, no warning.
      { event: fair, going: false, reminder_enabled: false, reminder_minutes_before: 60 },
      // Cancelled after the student marked it going.
      { event: gala, going: true, reminder_enabled: true, reminder_minutes_before: 60 },
    ],
  };
}

const state = new Map(
  Object.values(calendarTestAccounts)
    .filter((id) => id !== EMPTY_STUDENT)
    .map((id) => [id, fixture(id)]),
);

const eq = (params, key) => (params.get(key)?.startsWith("eq.") ? params.get(key).slice(3) : undefined);
const inList = (params, key) => {
  const value = params.get(key);
  return value?.startsWith("in.(") ? value.slice(4, -1).split(",").map((item) => item.replace(/^"|"$/g, "")) : undefined;
};

function send(request, response, status, rows, total = rows.length) {
  response.statusCode = status;
  response.setHeader("content-range", rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}`);
  if (request.method === "HEAD") return response.end();
  if ((request.headers.accept ?? "").includes("vnd.pgrst.object")) {
    if (rows.length !== 1) {
      response.statusCode = 406;
      return response.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }));
    }
    return response.end(JSON.stringify(rows[0]));
  }
  return response.end(JSON.stringify(rows));
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  return Array.isArray(body) ? body[0] : body;
}

/** Returns true when the request was one of the calendar students' and was answered here. */
export async function handleCalendar(request, response, url, claims) {
  const userId = claims.sub;
  if (!Object.values(calendarTestAccounts).includes(userId)) return false;
  const mine = state.get(userId);
  const path = url.pathname;
  const params = url.searchParams;
  const method = request.method;

  if (path === "/rest/v1/semester_plans" && (method === "GET" || method === "HEAD")) {
    let plans = mine ? [mine.plan] : [];
    const id = eq(params, "id");
    if (id) plans = plans.filter((plan) => plan.id === id);
    const startsBy = params.get("starts_on")?.startsWith("lte.") ? params.get("starts_on").slice(4) : null;
    const endsFrom = params.get("ends_on")?.startsWith("gte.") ? params.get("ends_on").slice(4) : null;
    if (startsBy) plans = plans.filter((plan) => plan.starts_on <= startsBy);
    if (endsFrom) plans = plans.filter((plan) => plan.ends_on >= endsFrom);
    return send(request, response, 200, plans.map((plan) => ({ ...plan, plan_courses: plan.plan_courses.map((pc) => ({ ...pc })) }))), true;
  }

  if (path === "/rest/v1/saved_events" && (method === "GET" || method === "HEAD")) {
    const statuses = params.get("events.status");
    const allowed = statuses?.startsWith("in.(") ? inList(params, "events.status") : statuses?.startsWith("eq.") ? [statuses.slice(3)] : ["published"];
    const eventId = eq(params, "event_id");
    const rows = (mine?.saved ?? [])
      .filter((saved) => (eventId ? saved.event.id === eventId : method === "HEAD" || allowed.includes(saved.event.status)))
      .map((saved) => ({
        event_id: saved.event.id,
        reminder_enabled: saved.reminder_enabled,
        reminder_minutes_before: saved.reminder_minutes_before,
        events: saved.event,
        // One-to-one with saved_events, so PostgREST embeds an object or null.
        going_events: saved.going ? { event_id: saved.event.id } : null,
      }));
    if ((request.headers.accept ?? "").includes("vnd.pgrst.object") && rows.length === 0) {
      response.statusCode = 200;
      return response.end("null"), true;
    }
    return send(request, response, 200, rows), true;
  }

  if (path === "/rest/v1/going_events" && (method === "POST" || method === "DELETE")) {
    const eventId = method === "POST" ? (await readBody(request)).event_id : eq(params, "event_id");
    const saved = mine?.saved.find((row) => row.event.id === eventId);
    if (!saved) {
      response.statusCode = 409;
      return response.end(JSON.stringify({ code: "23503", message: "insert or update violates foreign key constraint" })), true;
    }
    saved.going = method === "POST";
    response.statusCode = method === "POST" ? 201 : 200;
    return response.end(method === "POST" ? "" : "[]"), true;
  }

  if (path === "/rest/v1/resis_semesters" && method === "GET") {
    const ids = inList(params, "id") ?? (eq(params, "id") ? [eq(params, "id")] : null);
    const rows = [SEMESTER].filter((semester) => !ids || ids.includes(semester.id));
    return send(request, response, 200, rows), true;
  }

  if (path === "/rest/v1/course_offerings" && method === "GET") {
    const courseIds = inList(params, "course_id") ?? [eq(params, "course_id")];
    const rows = eq(params, "import_id") === SEMESTER.active_import_id && courseIds.includes(math202.id) ? [{ sections: SECTIONS }] : [];
    return send(request, response, 200, rows), true;
  }

  if (path === "/rest/v1/rpc/planner_section_changes" && method === "POST") return send(request, response, 200, []), true;
  if (path === "/rest/v1/rpc/planner_offered_sections" && method === "POST") {
    return send(request, response, 200, [{ course_id: math202.id, section_count: SECTIONS.length }]), true;
  }

  // Anything else (the header's counts, course search) is answered by the shared mock.
  return false;
}
