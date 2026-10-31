import { randomUUID } from "node:crypto";
import { courses } from "./mock-courses.mjs";

// Test-only, in-memory stand-in for SCRUM-66's planner tables: semester_plans,
// plan_courses, plan_meetings and reorder_plan_courses. It mimics just enough
// of PostgREST, RLS and the migration's checks for planner.spec.ts. Each test
// uses its own student, so nothing here needs resetting between tests.
export const plannerTestAccounts = {
  "planner-rana@mail.aub.edu": "00000000-0000-4000-8000-000000000301",
  "planner-omar@mail.aub.edu": "00000000-0000-4000-8000-000000000302",
  "planner-meetings@mail.aub.edu": "00000000-0000-4000-8000-000000000303",
  "planner-phone@mail.aub.edu": "00000000-0000-4000-8000-000000000304",
  "planner-keys@mail.aub.edu": "00000000-0000-4000-8000-000000000305",
  "planner-owner@mail.aub.edu": "00000000-0000-4000-8000-000000000306",
  "planner-dupes@mail.aub.edu": "00000000-0000-4000-8000-000000000307",
  // SCRUM-67: the conflict warnings.
  "planner-conflicts@mail.aub.edu": "00000000-0000-4000-8000-000000000308",
  "planner-incomplete@mail.aub.edu": "00000000-0000-4000-8000-000000000309",
  "planner-zones@mail.aub.edu": "00000000-0000-4000-8000-00000000030a",
};

const plans = [];
const planCourses = [];
const meetings = [];

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
  return removed;
}

/** A plan with its courses, catalogue values and meetings embedded. */
function planWithCourses(plan) {
  return {
    ...plan,
    plan_courses: planCourses
      .filter((planned) => planned.plan_id === plan.id)
      .map((planned) => {
        const course = courses.find((row) => row.id === planned.course_id);
        return {
          id: planned.id,
          course_id: planned.course_id,
          position: planned.position,
          courses: course && {
            code: course.code,
            name: course.name,
            credits: course.credits,
            department: course.department,
            prerequisites: course.prerequisites,
          },
          plan_meetings: meetings.filter((meeting) => meeting.plan_course_id === planned.id),
        };
      }),
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
  const tables = ["/rest/v1/semester_plans", "/rest/v1/plan_courses", "/rest/v1/plan_meetings", "/rest/v1/rpc/reorder_plan_courses"];
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
      const plan = { id: randomUUID(), student_id: userId, term: input.term, starts_on: input.starts_on, ends_on: input.ends_on };
      plans.push(plan);
      return respond(request, response, 201, [plan]), true;
    }
    if (method === "DELETE") {
      const removed = removeWhere(plans, (plan) => plan.id === eq(params, "id") && plan.student_id === userId);
      for (const plan of removed) deletePlanCourses((planned) => planned.plan_id === plan.id);
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
      return respond(request, response, 201, [planned]), true;
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
      const meeting = { id: randomUUID(), timezone: "Asia/Beirut", source: "manual", ...input };
      const problem = meetingProblem(meeting);
      if (problem) return fail(response, problem === "23505" ? 409 : 400, problem, "rejected meeting"), true;
      if (meetings.filter((row) => row.plan_course_id === meeting.plan_course_id).length >= 7) {
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
