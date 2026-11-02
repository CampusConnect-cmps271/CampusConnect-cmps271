import type { Meeting, PlanDetails, PlannedCourse, Weekday } from "./types";

/**
 * Deterministic planner fixtures for unit tests (SCRUM-66) and the conflict
 * engine (SCRUM-67). Synthetic: these courses and meeting times are made up
 * for tests and are not AUB timetable data. The plan uses the official
 * Spring 2026-27 dates, which span Beirut's spring daylight-saving change.
 */
export const FIXTURE_STUDENT_ID = "72000000-0000-4000-8000-000000000001";
export const FIXTURE_PLAN_ID = "72000000-0000-4000-8000-0000000000a1";

let meetingCount = 0;

function meeting(planCourseId: string, weekday: Weekday, start: string, end: string): Meeting {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  meetingCount += 1;
  return {
    id: `72000000-0000-4000-8000-${String(meetingCount).padStart(12, "0")}`,
    plan_course_id: planCourseId,
    weekday,
    start_minute: minutes(start),
    end_minute: minutes(end),
    timezone: "Asia/Beirut",
    source: "manual",
  };
}

function course(
  index: number,
  code: string,
  credits: string,
  slots: [Weekday, string, string][],
): PlannedCourse {
  const planCourseId = `72000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`;
  return {
    plan_course_id: planCourseId,
    course_id: `72000000-0000-4000-8000-0000000002${String(index).padStart(2, "0")}`,
    position: index,
    code,
    name: `Fixture course ${index}`,
    credits,
    meetings: slots.map(([weekday, start, end]) => meeting(planCourseId, weekday, start, end)),
  };
}

/**
 * Five courses covering the cases the conflict engine must tell apart:
 * - FIX 201 and FIX 202 overlap on Monday (10:00-10:45).
 * - FIX 203 starts on Wednesday exactly when FIX 201 ends: adjacent, no overlap.
 * - FIX 204 has no meetings: its schedule is unknown, not conflict-free.
 * - FIX 205 matches FIX 201's times on a different day.
 */
export const FIXTURE_COURSES: readonly PlannedCourse[] = [
  course(1, "FIX 201", "3", [[1, "09:30", "10:45"], [3, "09:30", "10:45"]]),
  course(2, "FIX 202", "3", [[1, "10:00", "11:15"]]),
  course(3, "FIX 203", "1", [[3, "10:45", "12:45"]]),
  course(4, "FIX 204", "3", []),
  course(5, "FIX 205", "3.25", [[2, "09:30", "10:45"]]),
];

export const FIXTURE_PLAN: PlanDetails = {
  id: FIXTURE_PLAN_ID,
  student_id: FIXTURE_STUDENT_ID,
  term: "Spring 2027",
  starts_on: "2027-01-13",
  ends_on: "2027-04-27",
  course_ids: FIXTURE_COURSES.map((planned) => planned.course_id),
  courses: [...FIXTURE_COURSES],
  items: [],
};

/** Total of FIXTURE_COURSES: 3 + 3 + 1 + 3 + 3.25. */
export const FIXTURE_CREDIT_HUNDREDTHS = 1325;
