import "server-only";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { PLANNER_LIMITS, plannerIdSchema } from "./schema";
import { courseSearchFilter } from "./search";
import { sortMeetings } from "./time";
import type { CourseSearchResult, Meeting, PlanDetails, PlanSummary } from "./types";

const PLAN_COLUMNS = "id, student_id, term, starts_on, ends_on";
const MEETING_COLUMNS = "id, plan_course_id, weekday, start_minute, end_minute, timezone, source";
const COURSE_COLUMNS = "code, name, credits, department, prerequisites";

type PlanCourseRow = {
  id: string;
  course_id: string;
  position: number;
  courses: {
    code: string;
    name: string;
    credits: number | string;
    department: string;
    prerequisites: string;
  } | null;
  plan_meetings: Meeting[] | null;
};

type PlanRow = {
  id: string;
  student_id: string;
  term: string;
  starts_on: string;
  ends_on: string;
  plan_courses: PlanCourseRow[] | null;
};

type SummaryRow = Omit<PlanRow, "plan_courses"> & { plan_courses: { course_id: string }[] | null };

function toPlanDetails(row: PlanRow): PlanDetails {
  const courses = [...(row.plan_courses ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((planned) => ({
      plan_course_id: planned.id,
      course_id: planned.course_id,
      position: planned.position,
      // RLS lets every signed-in student read the catalogue, and a planned
      // course cannot be deleted, so this is always present in practice.
      code: planned.courses?.code ?? "Unavailable course",
      name: planned.courses?.name ?? "",
      credits: planned.courses?.credits ?? 0,
      department: planned.courses?.department ?? "",
      prerequisites: planned.courses?.prerequisites ?? "",
      meetings: sortMeetings(planned.plan_meetings ?? []),
    }));

  return {
    id: row.id,
    student_id: row.student_id,
    term: row.term,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    course_ids: courses.map((planned) => planned.course_id),
    courses,
  };
}

/** The signed-in student's plans, earliest term first. Throws if they can't be read. */
export async function listMyPlans(): Promise<PlanSummary[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("semester_plans")
    .select(`${PLAN_COLUMNS}, plan_courses(course_id)`)
    .order("starts_on", { ascending: true })
    .returns<SummaryRow[]>();

  if (error) {
    log.error("planner.plans.read_failure", { code: error.code ?? null }, { userId: user.id });
    throw new Error("Semester plans could not be loaded.");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    term: row.term,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    course_count: row.plan_courses?.length ?? 0,
  }));
}

/**
 * One of the signed-in student's plans with its courses, in order, and their
 * meetings. Null when the id is not a plan the student owns (RLS hides
 * other students' plans), so the page can 404. Throws if it can't be read.
 */
export async function getMyPlan(planId: string): Promise<PlanDetails | null> {
  if (!plannerIdSchema.safeParse(planId).success) return null;

  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("semester_plans")
    .select(
      `${PLAN_COLUMNS}, plan_courses(id, course_id, position, courses(${COURSE_COLUMNS}), plan_meetings(${MEETING_COLUMNS}))`,
    )
    .eq("id", planId)
    .maybeSingle<PlanRow>();

  if (error) {
    log.error("planner.plan.read_failure", { planId, code: error.code ?? null }, { userId: user.id });
    throw new Error("The semester plan could not be loaded.");
  }

  return data ? toPlanDetails(data) : null;
}

/**
 * Catalogue courses whose code or name contains the query, case-insensitive.
 * Empty for an empty query; null when the search failed.
 */
export async function searchCoursesForPlan(query: string): Promise<CourseSearchResult[] | null> {
  if (!query) return [];

  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courses")
    .select("id, code, name, credits, department")
    .or(courseSearchFilter(query))
    .order("code", { ascending: true })
    .limit(PLANNER_LIMITS.searchResults)
    .returns<CourseSearchResult[]>();

  if (error) {
    log.error("planner.courses.search_failure", { code: error.code ?? null }, { userId: user.id });
    return null;
  }

  return data ?? [];
}
