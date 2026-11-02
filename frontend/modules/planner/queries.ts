import "server-only";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { addDays, itemWindow } from "./calendar";
import { detectConflicts, type ConflictReport } from "./conflicts";
import { PLANNER_LIMITS, plannerIdSchema } from "./schema";
import { courseSearchFilter } from "./search";
import { sortMeetings } from "./time";
import type { CourseSearchResult, Meeting, PlanDetails, PlanItem, PlannerEvent, PlanSummary } from "./types";

const PLAN_COLUMNS = "id, student_id, term, starts_on, ends_on";
const MEETING_COLUMNS = "id, plan_course_id, weekday, start_minute, end_minute, timezone, source";
const COURSE_COLUMNS = "code, name, credits";
const ITEM_COLUMNS = "id, plan_id, plan_course_id, title, on_date, start_minute, end_minute";

type PlanCourseRow = {
  id: string;
  course_id: string;
  position: number;
  courses: { code: string; name: string; credits: number | string } | null;
  plan_meetings: Meeting[] | null;
};

type PlanRow = {
  id: string;
  student_id: string;
  term: string;
  starts_on: string;
  ends_on: string;
  plan_courses: PlanCourseRow[] | null;
  plan_items: PlanItem[] | null;
};

type SummaryRow = Omit<PlanRow, "plan_courses" | "plan_items"> & { plan_courses: { course_id: string }[] | null };

type SavedEventRow = {
  event_id: string;
  events: { id: string; title: string; starts_at: string; ends_at: string; location: string } | null;
  // One-to-one with saved_events, so PostgREST embeds an object or null; a list is tolerated too.
  going_events: { event_id: string } | { event_id: string }[] | null;
};

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
      meetings: sortMeetings(planned.plan_meetings ?? []),
    }));
  // By date, all-day items first, then by start time.
  const items = [...(row.plan_items ?? [])].sort(
    (a, b) => a.on_date.localeCompare(b.on_date) || (a.start_minute ?? -1) - (b.start_minute ?? -1),
  );

  return {
    id: row.id,
    student_id: row.student_id,
    term: row.term,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    course_ids: courses.map((planned) => planned.course_id),
    courses,
    items,
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
      `${PLAN_COLUMNS}, plan_courses(id, course_id, position, courses(${COURSE_COLUMNS}), plan_meetings(${MEETING_COLUMNS})), plan_items(${ITEM_COLUMNS})`,
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
    .select("id, code, name, credits")
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

/**
 * The student's saved, published events that touch the plan's calendar:
 * the dates its own items may use, a day wider either side for Beirut's
 * offset. Earliest first. Null when they couldn't be read.
 */
export async function listSavedEventsNear(plan: PlanDetails): Promise<PlannerEvent[] | null> {
  const window = itemWindow(plan);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("saved_events")
    .select("event_id, events!inner(id, title, starts_at, ends_at, location), going_events(event_id)")
    .eq("events.status", "published")
    .lt("events.starts_at", `${addDays(window.last, 2)}T00:00:00Z`)
    .gt("events.ends_at", `${addDays(window.first, -1)}T00:00:00Z`)
    .returns<SavedEventRow[]>();

  if (error) {
    log.error("planner.events.read_failure", { planId: plan.id, code: error.code ?? null }, { userId: plan.student_id });
    return null;
  }

  return (data ?? [])
    .flatMap((row) => {
      if (!row.events) return [];
      const going = Array.isArray(row.going_events) ? row.going_events.length > 0 : Boolean(row.going_events);
      const { id, title, starts_at, ends_at, location } = row.events;
      return [{ id, title, starts_at, ends_at, location, going }];
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * Whether the signed-in student has saved an event and marked it as going,
 * for the event page. Null when it couldn't be read.
 */
export async function getEventPlannerState(eventId: string): Promise<{ saved: boolean; going: boolean } | null> {
  if (!plannerIdSchema.safeParse(eventId).success) return { saved: false, going: false };

  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("saved_events")
    .select("event_id, going_events(event_id)")
    .eq("event_id", eventId)
    .maybeSingle<Pick<SavedEventRow, "event_id" | "going_events">>();

  if (error) {
    log.error("planner.event_state.read_failure", { eventId, code: error.code ?? null }, { userId: user.id });
    return null;
  }
  if (!data) return { saved: false, going: false };
  const going = Array.isArray(data.going_events) ? data.going_events.length > 0 : Boolean(data.going_events);
  return { saved: true, going };
}

/**
 * Runs the conflict engine on a plan as just read from the database, with
 * the events the student is going to. The plan page calls it on every
 * render, which every planner action triggers, so the result always
 * matches the saved data. Logs counts only.
 */
export function checkPlanConflicts(plan: PlanDetails, events: readonly PlannerEvent[] = []): ConflictReport {
  const going = events.filter((event) => event.going);
  const report = detectConflicts({ ...plan, events: going });
  log.info(
    "planner.conflicts.checked",
    {
      planId: plan.id,
      status: report.status,
      conflicts: report.conflicts.length,
      unknown: report.unknown.length,
      invalid: report.invalid.length,
      items: plan.items.length,
      events: going.length,
    },
    { userId: plan.student_id },
  );
  return report;
}
