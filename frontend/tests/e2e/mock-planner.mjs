import { randomUUID } from "node:crypto";
import { courses as baseCourses } from "./mock-courses.mjs";
import { attributeCourses, attributeSections } from "./mock-attribute-courses.mjs";
const courses = [...baseCourses, ...attributeCourses];

// Test-only, in-memory stand-in for the planner tables: semester_plans,
// plan_courses, plan_meetings, plan_items, going_events and
// reorder_plan_courses, plus the saved events the planner reads. It mimics
// just enough of PostgREST, RLS and the migrations' checks for
// planner.spec.ts. Each test uses its own student, so nothing here needs
// resetting between tests.
export const plannerTestAccounts = {
  "electives-schedule@mail.aub.edu": "00000000-0000-4000-8000-000000000509",
  "planner-rana@mail.aub.edu": "00000000-0000-4000-8000-000000000301",
  "planner-omar@mail.aub.edu": "00000000-0000-4000-8000-000000000302",
  "planner-phone@mail.aub.edu": "00000000-0000-4000-8000-000000000304",
  "planner-keys@mail.aub.edu": "00000000-0000-4000-8000-000000000305",
  "planner-owner@mail.aub.edu": "00000000-0000-4000-8000-000000000306",
  "planner-dupes@mail.aub.edu": "00000000-0000-4000-8000-000000000307",
  // SCRUM-67: the conflict warnings.
  "planner-conflicts@mail.aub.edu": "00000000-0000-4000-8000-000000000308",
  "planner-incomplete@mail.aub.edu": "00000000-0000-4000-8000-000000000309",
  // The calendar: own items and events the student is going to.
  "planner-calendar@mail.aub.edu": "00000000-0000-4000-8000-00000000030b",
  // SCRUM-243: class times from sections of the imported schedule.
  "planner-sections@mail.aub.edu": "00000000-0000-4000-8000-00000000030c",
};

// SCRUM-243. New plans link themselves to an imported semester, as the
// database's insert trigger would. Only Spring 2027 is imported, so plans for
// other terms stay unlinked.
const SEMESTERS = {
  "202720": { id: "202720", name: "Spring 2026-2027", synced_at: "2026-11-08T00:00:00Z", import_id: "00000000-0000-4000-a000-000000202720" },
};
const TERM_SEMESTER = { "Spring 2027": "202720" };

// Synthetic sections, NOT AUB's schedule: MATH 202 has two lectures sharing
// one recitation, CMPS 241 a lecture with a linked lab, CMPS 240 has a single
// section, MATH 201 isn't offered.
const lecture = (days, start, end) => ({ days, start, end, type: "Lecture", location: "Test Hall 101", instructor: "Test Instructor" });
const OFFERINGS = {
  ...Object.fromEntries(attributeCourses.map(course=>[course.code,attributeSections(course)])),
  "MATH 202": [
    { crn: "90011", section: "1", sessions: [lecture("MWF", "09:00", "09:50")], instructors: ["Test Instructor"], connected_crns: ["90013"] },
    { crn: "90012", section: "2", sessions: [lecture("TR", "11:00", "12:15")], instructors: ["Test Instructor"], connected_crns: ["90013"] },
    {
      crn: "90013",
      section: "E1",
      sessions: [{ days: "W", start: "16:00", end: "16:50", type: "Recitation", location: "Test Hall 102", instructor: "Test Assistant" }],
      instructors: ["Test Assistant"],
      connected_crns: ["90011", "90012"],
    },
  ],
  "CMPS 240": [{ crn: "90021", section: "1", sessions: [lecture("TR", "14:00", "15:15")], instructors: ["Test Instructor"], connected_crns: [] }],
  // One section whose time isn't announced yet.
  "CMPS 101": [{ crn: "90041", section: "1", sessions: [{ days: "", start: "TBA", end: "TBA", type: "Lecture", location: "", instructor: "TBA" }], connected_crns: [] }],
  "CMPS 241": [
    { crn: "90031", section: "L1", sessions: [lecture("MW", "10:00", "11:15")], instructors: ["Test Instructor"], connected_crns: ["90032"] },
    {
      crn: "90032",
      section: "B1",
      sessions: [{ days: "F", start: "14:00", end: "16:00", type: "Lab", location: "Test Lab 1", instructor: "Test Assistant" }],
      instructors: ["Test Assistant"],
      connected_crns: ["90031"],
    },
  ],
};
const offeringFor = (courseId) => {
  const code = courses.find((course) => course.id === courseId)?.code;
  return code ? OFFERINGS[code] : undefined;
};

/** public.planner_resis_session_rows, for the mock: one row per weekday letter, none for TBA. */
function sessionRows(session) {
  const days = (session.days ?? "").replace(/\s/g, "");
  const time = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? "");
  const start = time(session.start);
  const end = time(session.end);
  if (!/^[MTWRFSU]+$/.test(days) || !start || !end) return [];
  const [startMinute, endMinute] = [Number(start[1]) * 60 + Number(start[2]), Number(end[1]) * 60 + Number(end[2])];
  if (endMinute <= startMinute) return [];
  return [...new Set(days)].map((letter) => ({ weekday: "MTWRFSU".indexOf(letter) + 1, start_minute: startMinute, end_minute: endMinute }));
}

const sectionLinks = [];
// As if a newer snapshot moved CMPS 240's section after it was chosen: reported
// as changed until the student updates that course's times.
const MOVED_CRNS = new Set(["90021"]);
const updatedCourses = new Set();

// Synthetic published events that planner-calendar has saved. Not real AUB
// events. Tue 16 Feb 2027 11:30-12:30 and Wed 17 Feb 2027 13:00-15:00 Beirut.
const events = [
  {
    id: "00000000-0000-4000-8000-000000000e01",
    title: "Robotics club talk",
    starts_at: "2027-02-16T09:30:00+00:00",
    ends_at: "2027-02-16T10:30:00+00:00",
    location: "Bechtel 101",
  },
  {
    id: "00000000-0000-4000-8000-000000000e02",
    title: "Career fair",
    starts_at: "2027-02-17T11:00:00+00:00",
    ends_at: "2027-02-17T13:00:00+00:00",
    location: "West Hall",
  },
];
const savedEvents = events.map((event) => ({ student_id: plannerTestAccounts["planner-calendar@mail.aub.edu"], event_id: event.id }));

const plans = [];
const planCourses = [];
const meetings = [];
const items = [];
const going = [];

const TERM_PATTERN = /^(Fall|Spring|Summer) 20(2[5-9]|3[0-5])$/;

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  return Array.isArray(body) ? body[0] : body;
}

function send(response, status, body) {
  response.statusCode = status;
  return response.end(body === undefined ? "" : JSON.stringify(body));
}

function fail(response, status, code, message) {
  return send(response, status, { code, message, details: null, hint: null });
}

/** Rows as PostgREST returns them: one object for .single(), else a list. */
function respond(request, response, status, rows) {
  if ((request.headers.accept ?? "").includes("vnd.pgrst.object")) {
    if (rows.length !== 1) return fail(response, 406, "PGRST116", "JSON object requested, multiple (or no) rows returned");
    return send(response, status, rows[0]);
  }
  return send(response, status, rows);
}

const eq = (params, key) => params.get(key)?.startsWith("eq.") ? params.get(key).slice(3) : undefined;
const ownedPlan = (planId, userId) => plans.find((plan) => plan.id === planId && plan.student_id === userId);
const ownedPlanCourse = (id, userId) => {
  const planned = planCourses.find((row) => row.id === id);
  return planned && ownedPlan(planned.plan_id, userId) ? planned : undefined;
};
const ownedMeeting = (id, userId) => {
  const meeting = meetings.find((row) => row.id === id);
  return meeting && ownedPlanCourse(meeting.plan_course_id, userId) ? meeting : undefined;
};

function removeWhere(rows, predicate) {
  const removed = rows.filter(predicate);
  for (const row of removed) rows.splice(rows.indexOf(row), 1);
  return removed;
}

function deletePlanCourses(predicate) {
  const removed = removeWhere(planCourses, predicate);
  removeWhere(meetings, (meeting) => removed.some((planned) => planned.id === meeting.plan_course_id));
  removeWhere(sectionLinks, (link) => removed.some((planned) => planned.id === link.plan_course_id));
  // plan_items.plan_course_id is "on delete set null".
  for (const item of items) if (removed.some((planned) => planned.id === item.plan_course_id)) item.plan_course_id = null;
  return removed;
}

const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The item checks from the calendar migration; returns an error code or null. */
function itemProblem(item) {
  const plan = plans.find((row) => row.id === item.plan_id);
  if (!plan) return "42501";
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const start = item.start_minute ?? null;
  const end = item.end_minute ?? null;
  const allDay = start === null && end === null;
  const timed = start !== null && end !== null && start >= 0 && start <= 1439 && end >= 1 && end <= 1440 && end > start;
  if (title.length < 1 || title.length > 120 || !(allDay || timed)) return "23514";
  if (item.on_date < addDays(plan.starts_on, -30) || item.on_date > addDays(plan.ends_on, 30)) return "23514";
  if (item.plan_course_id && !planCourses.some((row) => row.id === item.plan_course_id && row.plan_id === item.plan_id)) {
    return "23503";
  }
  return null;
}

/** A plan with its courses, catalogue values and meetings embedded. */
function planWithCourses(plan) {
  const semester = plan.resis_semester_id ? SEMESTERS[plan.resis_semester_id] : null;
  return {
    ...plan,
    resis_semester_id: plan.resis_semester_id ?? null,
    resis_semesters: semester ? { id: semester.id, name: semester.name, synced_at: semester.synced_at } : null,
    plan_courses: planCourses
      .filter((planned) => planned.plan_id === plan.id)
      .map((planned) => {
        const course = courses.find((row) => row.id === planned.course_id);
        return {
          id: planned.id,
          course_id: planned.course_id,
          position: planned.position,
          courses: course && { code: course.code, name: course.name, credits: course.credits },
          plan_meetings: meetings.filter((meeting) => meeting.plan_course_id === planned.id),
          plan_course_sections: sectionLinks.filter((link) => link.plan_course_id === planned.id),
        };
      }),
    plan_items: items.filter((item) => item.plan_id === plan.id),
  };
}

/** Like planner_check_meeting's pg_timezone_names lookup, through Intl. */
function knownZone(zone) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone === zone;
  } catch {
    return false;
  }
}

/** The meeting checks from the migration; returns an error code or null. */
function meetingProblem(meeting, ownId) {
  const { weekday, start_minute: start, end_minute: end } = meeting;
  if (!(weekday >= 1 && weekday <= 7) || !(start >= 0 && start <= 1439) || !(end >= 1 && end <= 1440) || end <= start) {
    return "23514";
  }
  if (!knownZone(meeting.timezone)) return "22023";
  const duplicate = meetings.some(
    (row) =>
      row.id !== ownId &&
      row.plan_course_id === meeting.plan_course_id &&
      row.weekday === weekday &&
      row.start_minute === start &&
      row.end_minute === end &&
      row.timezone === meeting.timezone,
  );
  return duplicate ? "23505" : null;
}

// Returns true when the request was handled here.
export async function handlePlanner(request, response, url, claims) {
  const path = url.pathname;
  const params = url.searchParams;
  const method = request.method;
  const tables = [
    "/rest/v1/semester_plans",
    "/rest/v1/plan_courses",
    "/rest/v1/plan_meetings",
    "/rest/v1/plan_items",
    "/rest/v1/saved_events",
    "/rest/v1/going_events",
    "/rest/v1/rpc/reorder_plan_courses",
    "/rest/v1/course_offerings",
    "/rest/v1/rpc/planner_offered_sections",
    "/rest/v1/rpc/planner_section_changes",
    "/rest/v1/rpc/planner_choose_sections",
  ];
  if (!tables.includes(path)) return false;

  const userId = claims.sub;
  if (!userId) return fail(response, 401, "42501", "permission denied"), true;

  if (path === "/rest/v1/semester_plans") {
    if (method === "GET") {
      const id = eq(params, "id");
      const rows = plans
        .filter((plan) => plan.student_id === userId && (id === undefined || plan.id === id))
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
        .map(planWithCourses);
      return respond(request, response, 200, rows), true;
    }
    if (method === "POST") {
      const input = await readBody(request);
      if (!TERM_PATTERN.test(input.term) || !(input.ends_on > input.starts_on)) {
        return fail(response, 400, "23514", "new row violates check constraint"), true;
      }
      const mine = plans.filter((plan) => plan.student_id === userId);
      if (mine.some((plan) => plan.term === input.term)) {
        return fail(response, 409, "23505", "duplicate key value violates unique constraint"), true;
      }
      if (mine.length >= 10) return fail(response, 400, "54000", "A student can keep at most 10 semester plans"), true;
      const plan = {
        id: randomUUID(),
        student_id: userId,
        term: input.term,
        starts_on: input.starts_on,
        ends_on: input.ends_on,
        resis_semester_id: TERM_SEMESTER[input.term] ?? null,
      };
      plans.push(plan);
      return respond(request, response, 201, [plan]), true;
    }
    if (method === "PATCH") {
      const plan = ownedPlan(eq(params, "id"), userId);
      if (!plan) return respond(request, response, 200, []), true;
      const { resis_semester_id: semesterId } = await readBody(request);
      if (semesterId && !SEMESTERS[semesterId]) {
        return fail(response, 403, "42501", "new row violates row-level security policy"), true;
      }
      plan.resis_semester_id = semesterId ?? null;
      return respond(request, response, 200, [plan]), true;
    }
    if (method === "DELETE") {
      const removed = removeWhere(plans, (plan) => plan.id === eq(params, "id") && plan.student_id === userId);
      for (const plan of removed) {
        deletePlanCourses((planned) => planned.plan_id === plan.id);
        removeWhere(items, (item) => item.plan_id === plan.id);
      }
      return respond(request, response, 200, removed), true;
    }
  }

  if (path === "/rest/v1/plan_courses") {
    if (method === "GET") {
      const planId = eq(params, "plan_id");
      const rows = ownedPlan(planId, userId)
        ? planCourses.filter((planned) => planned.plan_id === planId).sort((a, b) => a.position - b.position)
        : [];
      return respond(request, response, 200, rows), true;
    }
    if (method === "POST") {
      const input = await readBody(request);
      if (!ownedPlan(input.plan_id, userId)) {
        return fail(response, 403, "42501", "new row violates row-level security policy"), true;
      }
      if (!courses.some((course) => course.id === input.course_id)) {
        return fail(response, 409, "23503", "insert or update violates foreign key constraint"), true;
      }
      const inPlan = planCourses.filter((planned) => planned.plan_id === input.plan_id);
      if (inPlan.some((planned) => planned.course_id === input.course_id)) {
        return fail(response, 409, "23505", "duplicate key value violates unique constraint"), true;
      }
      if (inPlan.length >= 12) return fail(response, 400, "54000", "A semester plan can hold at most 12 courses"), true;
      const planned = {
        id: randomUUID(),
        plan_id: input.plan_id,
        course_id: input.course_id,
        position: Math.max(0, ...inPlan.map((row) => row.position)) + 1,
      };
      planCourses.push(planned);
      const plan = plans.find((row) => row.id === input.plan_id);
      return respond(request, response, 201, [{ ...planned, semester_plans: { resis_semester_id: plan?.resis_semester_id ?? null } }]), true;
    }
    if (method === "DELETE") {
      const removed = deletePlanCourses(
        (planned) => planned.id === eq(params, "id") && planned.plan_id === eq(params, "plan_id") && ownedPlan(planned.plan_id, userId),
      );
      return respond(request, response, 200, removed), true;
    }
  }

  if (path === "/rest/v1/plan_meetings") {
    if (method === "POST") {
      const input = await readBody(request);
      if (!ownedPlanCourse(input.plan_course_id, userId)) {
        return fail(response, 403, "42501", "new row violates row-level security policy"), true;
      }
      if (input.source && input.source !== "manual") {
        return fail(response, 403, "42501", "new row violates row-level security policy"), true;
      }
      if (sectionLinks.some((link) => link.plan_course_id === input.plan_course_id)) {
        return fail(response, 400, "55000", "This course takes its times from AUB sections"), true;
      }
      const meeting = { id: randomUUID(), timezone: "Asia/Beirut", source: "manual", crn: null, ...input };
      const problem = meetingProblem(meeting);
      if (problem) return fail(response, problem === "23505" ? 409 : 400, problem, "rejected meeting"), true;
      if (meetings.filter((row) => row.plan_course_id === meeting.plan_course_id && row.source === "manual").length >= 7) {
        return fail(response, 400, "54000", "A planned course can have at most 7 meetings"), true;
      }
      meetings.push(meeting);
      return respond(request, response, 201, [meeting]), true;
    }
    if (method === "PATCH") {
      const meeting = ownedMeeting(eq(params, "id"), userId);
      if (!meeting) return respond(request, response, 200, []), true;
      const changed = { ...meeting, ...(await readBody(request)) };
      const problem = meetingProblem(changed, meeting.id);
      if (problem) return fail(response, problem === "23505" ? 409 : 400, problem, "rejected meeting"), true;
      Object.assign(meeting, changed);
      return respond(request, response, 200, [meeting]), true;
    }
    if (method === "DELETE") {
      const removed = removeWhere(meetings, (meeting) => meeting.id === eq(params, "id") && ownedMeeting(meeting.id, userId));
      return respond(request, response, 200, removed), true;
    }
  }

  if (path === "/rest/v1/plan_items") {
    if (method === "POST") {
      const input = await readBody(request);
      if (!ownedPlan(input.plan_id, userId)) {
        return fail(response, 403, "42501", "new row violates row-level security policy"), true;
      }
      const item = { id: randomUUID(), plan_course_id: null, start_minute: null, end_minute: null, ...input };
      const problem = itemProblem(item);
      if (problem) return fail(response, problem === "23503" ? 409 : 400, problem, "rejected item"), true;
      if (items.filter((row) => row.plan_id === item.plan_id).length >= 100) {
        return fail(response, 400, "54000", "A semester plan can hold at most 100 items"), true;
      }
      items.push(item);
      return respond(request, response, 201, [item]), true;
    }
    if (method === "PATCH") {
      const item = items.find(
        (row) => row.id === eq(params, "id") && row.plan_id === eq(params, "plan_id") && ownedPlan(row.plan_id, userId),
      );
      if (!item) return respond(request, response, 200, []), true;
      const changed = { ...item, ...(await readBody(request)) };
      const problem = itemProblem(changed);
      if (problem) return fail(response, problem === "23503" ? 409 : 400, problem, "rejected item"), true;
      Object.assign(item, changed);
      return respond(request, response, 200, [item]), true;
    }
    if (method === "DELETE") {
      const removed = removeWhere(
        items,
        (item) => item.id === eq(params, "id") && item.plan_id === eq(params, "plan_id") && ownedPlan(item.plan_id, userId),
      );
      return respond(request, response, 200, removed), true;
    }
  }

  // The planner's reads of saved events: every one is published and upcoming.
  if (path === "/rest/v1/saved_events" && method === "GET") {
    const eventId = eq(params, "event_id");
    const rows = savedEvents
      .filter((saved) => saved.student_id === userId && (eventId === undefined || saved.event_id === eventId))
      .map((saved) => ({
        event_id: saved.event_id,
        events: events.find((event) => event.id === saved.event_id),
        // One-to-one with saved_events, so PostgREST embeds an object or null.
        going_events: going.some((mark) => mark.student_id === userId && mark.event_id === saved.event_id)
          ? { event_id: saved.event_id }
          : null,
      }));
    if ((request.headers.accept ?? "").includes("vnd.pgrst.object") && rows.length === 0) return send(response, 200, null), true;
    return respond(request, response, 200, rows), true;
  }

  if (path === "/rest/v1/going_events") {
    if (method === "POST") {
      const { event_id: eventId } = await readBody(request);
      if (!savedEvents.some((saved) => saved.student_id === userId && saved.event_id === eventId)) {
        return fail(response, 409, "23503", "insert or update violates foreign key constraint"), true;
      }
      if (going.some((mark) => mark.student_id === userId && mark.event_id === eventId)) {
        return fail(response, 409, "23505", "duplicate key value violates unique constraint"), true;
      }
      going.push({ student_id: userId, event_id: eventId });
      return send(response, 201), true;
    }
    if (method === "DELETE") {
      const removed = removeWhere(going, (mark) => mark.student_id === userId && mark.event_id === eq(params, "event_id"));
      return send(response, 200, removed), true;
    }
  }

  // SCRUM-243: the active snapshot's sections, readable by any signed-in student.
  if (path === "/rest/v1/course_offerings" && method === "GET") {
    const semester = Object.values(SEMESTERS).find((row) => row.import_id === eq(params, "import_id"));
    const sections = semester ? offeringFor(eq(params, "course_id")) : undefined;
    return respond(request, response, 200, sections ? [{ sections }] : []), true;
  }

  if (path === "/rest/v1/rpc/planner_offered_sections" && method === "POST") {
    const { p_semester_id: semesterId, p_course_ids: courseIds = [] } = await readBody(request);
    const rows = SEMESTERS[semesterId]
      ? courseIds.flatMap((courseId) => (offeringFor(courseId) ? [{ course_id: courseId, section_count: offeringFor(courseId).length }] : []))
      : [];
    return send(response, 200, rows), true;
  }

  if (path === "/rest/v1/rpc/planner_section_changes" && method === "POST") {
    const { p_plan_id: planId } = await readBody(request);
    const plan = ownedPlan(planId, userId);
    const semester = plan?.resis_semester_id ? SEMESTERS[plan.resis_semester_id] : null;
    const inPlan = new Set(planCourses.filter((planned) => planned.plan_id === planId).map((planned) => planned.id));
    const rows = semester
      ? sectionLinks
          .filter((link) => inPlan.has(link.plan_course_id) && MOVED_CRNS.has(link.crn) && !updatedCourses.has(link.plan_course_id))
          .map((link) => ({ plan_course_id: link.plan_course_id, crn: link.crn, section: link.section, status: "changed", imported_at: semester.synced_at }))
      : [];
    return send(response, 200, rows), true;
  }

  // planner_choose_sections: its checks and the rows it writes, in miniature.
  if (path === "/rest/v1/rpc/planner_choose_sections" && method === "POST") {
    const { p_plan_course_id: planCourseId, p_crns: requested = [] } = await readBody(request);
    const planned = ownedPlanCourse(planCourseId, userId);
    if (!planned) return fail(response, 403, "42501", "That course is not in one of your plans"), true;
    const crns = [...new Set(requested)];
    if (crns.some((crn) => !/^\d{1,10}$/.test(crn))) return fail(response, 400, "22023", "A CRN is a number"), true;
    if (crns.length > 4) return fail(response, 400, "54000", "Choose at most 4 sections"), true;
    if (crns.length === 0) {
      removeWhere(meetings, (meeting) => meeting.plan_course_id === planCourseId && meeting.source === "resis");
      removeWhere(sectionLinks, (link) => link.plan_course_id === planCourseId);
      return send(response, 200, 0), true;
    }
    const plan = plans.find((row) => row.id === planned.plan_id);
    const semester = plan?.resis_semester_id ? SEMESTERS[plan.resis_semester_id] : null;
    if (!semester) return fail(response, 400, "55000", "Link this plan to an imported semester first"), true;
    const chosen = (offeringFor(planned.course_id) ?? []).filter((section) => crns.includes(section.crn));
    if (chosen.length !== crns.length) return fail(response, 400, "22023", "Each CRN must be a section of this course"), true;

    const before = sectionLinks.filter((link) => link.plan_course_id === planCourseId).map((link) => link.crn).sort();
    if (before.length && JSON.stringify(before) === JSON.stringify([...crns].sort())) updatedCourses.add(planCourseId);
    removeWhere(meetings, (meeting) => meeting.plan_course_id === planCourseId);
    removeWhere(sectionLinks, (link) => link.plan_course_id === planCourseId);
    const seen = new Set();
    for (const section of [...chosen].sort((a, b) => a.crn.localeCompare(b.crn))) {
      sectionLinks.push({ plan_course_id: planCourseId, crn: section.crn, section: section.section, semester_id: semester.id });
      for (const row of section.sessions.flatMap(sessionRows)) {
        const key = [row.weekday, row.start_minute, row.end_minute].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        meetings.push({ id: randomUUID(), plan_course_id: planCourseId, ...row, timezone: "Asia/Beirut", source: "resis", crn: section.crn });
      }
    }
    return send(response, 200, seen.size), true;
  }

  if (path === "/rest/v1/rpc/reorder_plan_courses" && method === "POST") {
    const { plan_id: planId, course_ids: courseIds = [] } = await readBody(request);
    if (!ownedPlan(planId, userId)) return fail(response, 404, "P0002", "Semester plan not found"), true;
    const inPlan = planCourses.filter((planned) => planned.plan_id === planId);
    const current = inPlan.map((planned) => planned.course_id).sort();
    if (JSON.stringify([...courseIds].sort()) !== JSON.stringify(current)) {
      return fail(response, 400, "22023", "The new order must list each course in the plan exactly once"), true;
    }
    for (const planned of inPlan) planned.position = courseIds.indexOf(planned.course_id) + 1;
    return send(response, 204), true;
  }

  return fail(response, 405, "PGRST105", "Unsupported planner request"), true;
}
