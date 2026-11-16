import "server-only";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { addDays, ITEM_WINDOW_DAYS, itemWindow, parseCalendarDate } from "./calendar";
import { calendarEntries, type SavedCalendarEvent } from "./calendar-data";
import { buildCalendarView, calendarRangeFor, type CalendarData, type CalendarViewMode, type CalendarViewModel } from "./calendar-view";
import { beirutToday } from "./terms";
import { detectConflicts, type ConflictReport } from "./conflicts";
import { PLANNER_LIMITS, plannerIdSchema } from "./schema";
import { courseSearchFilter } from "./search";
import { sectionOptions, type ResisSection, type SectionOption } from "./sections";
import { sortMeetings } from "./time";
import type {
  ChosenSection,
  CourseSearchResult,
  ImportedSemester,
  Meeting,
  PlanDetails,
  PlanItem,
  PlannedCourse,
  PlannerEvent,
  PlanSummary,
  SectionChange,
} from "./types";

const PLAN_COLUMNS = "id, student_id, term, starts_on, ends_on, resis_semester_id, resis_semesters(id, name, synced_at)";
const MEETING_COLUMNS = "id, plan_course_id, weekday, start_minute, end_minute, timezone, source, crn";
const COURSE_COLUMNS = "code, name, credits";
const ITEM_COLUMNS = "id, plan_id, plan_course_id, title, on_date, start_minute, end_minute";
/** A plan with its courses, their meetings and sections, and its items. */
const PLAN_DETAIL_COLUMNS = `${PLAN_COLUMNS}, plan_courses(id, course_id, position, courses(${COURSE_COLUMNS}), plan_meetings(${MEETING_COLUMNS}), plan_course_sections(crn, section, semester_id)), plan_items(${ITEM_COLUMNS})`;

type PlanCourseRow = {
  id: string;
  course_id: string;
  position: number;
  courses: { code: string; name: string; credits: number | string } | null;
  plan_meetings: Meeting[] | null;
  plan_course_sections?: ChosenSection[] | null;
};

type PlanRow = {
  id: string;
  student_id: string;
  term: string;
  starts_on: string;
  ends_on: string;
  resis_semester_id?: string | null;
  resis_semesters?: ImportedSemester | null;
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
      sections: [...(planned.plan_course_sections ?? [])].sort(
        (a, b) => a.section.localeCompare(b.section, "en", { numeric: true }) || a.crn.localeCompare(b.crn),
      ),
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
    semester: row.resis_semester_id && row.resis_semesters ? row.resis_semesters : null,
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
    .select(PLAN_DETAIL_COLUMNS)
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
 * On a plan linked to an imported semester, each result also says how many
 * sections that semester has (null: not offered). Empty for an empty query;
 * null when the search failed.
 */
export async function searchCoursesForPlan(query: string, semesterId?: string | null): Promise<CourseSearchResult[] | null> {
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

  const results = data ?? [];
  if (!semesterId || results.length === 0) return results;

  const offered = await offeredSections(semesterId, results.map((course) => course.id), user.id);
  if (!offered) return results;
  return results.map((course) => ({ ...course, section_count: offered.get(course.id) ?? null }));
}

/** Sections per course in a semester's active snapshot; null when it couldn't be read. */
async function offeredSections(semesterId: string, courseIds: string[], userId: string): Promise<Map<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("planner_offered_sections", { p_semester_id: semesterId, p_course_ids: courseIds });
  if (error) {
    log.warn("planner.offerings.read_failure", { semesterId, code: error.code ?? null }, { userId });
    return null;
  }
  const rows = (data ?? []) as { course_id: string; section_count: number }[];
  return new Map(rows.map((row) => [row.course_id, row.section_count]));
}

/** What the plan page shows about AUB's imported schedule for one plan. */
export type PlanSectionState = {
  /** Semesters with an active import: what the plan can link to. */
  semesters: ImportedSemester[];
  /** Chosen sections a newer snapshot changed or no longer has. */
  changes: SectionChange[];
  /** Sections per planned course in the linked semester; absent when not offered. */
  offered: ReadonlyMap<string, number>;
};

/**
 * The imported semesters, and on a linked plan its section changes and which
 * of its courses the semester offers. A part that can't be read is left
 * empty and logged, so the plan page still works.
 */
export async function getPlanSectionState(plan: PlanDetails): Promise<PlanSectionState> {
  const supabase = await createClient();
  const userId = plan.student_id;

  const readSemesters = async () => {
    const { data, error } = await supabase
      .from("resis_semesters")
      .select("id, name, synced_at")
      .not("active_import_id", "is", null)
      .order("id", { ascending: true })
      .returns<ImportedSemester[]>();
    if (error) log.warn("planner.semesters.read_failure", { planId: plan.id, code: error.code ?? null }, { userId });
    return data ?? [];
  };
  const readChanges = async (): Promise<SectionChange[]> => {
    if (!plan.semester) return [];
    const { data, error } = await supabase.rpc("planner_section_changes", { p_plan_id: plan.id });
    if (error) log.warn("planner.section_changes.read_failure", { planId: plan.id, code: error.code ?? null }, { userId });
    return (data ?? []) as SectionChange[];
  };
  const readOffered = async () => {
    if (!plan.semester || plan.course_ids.length === 0) return new Map<string, number>();
    return (await offeredSections(plan.semester.id, plan.course_ids, userId)) ?? new Map<string, number>();
  };

  const [semesters, changes, offered] = await Promise.all([readSemesters(), readChanges(), readOffered()]);
  if (changes.length) log.info("planner.section_changes.found", { planId: plan.id, changes: changes.length }, { userId });
  return { semesters, changes, offered };
}

/** The section picker for one planned course: the linked semester's sections of it. */
export type SectionPicker = {
  planned: Pick<PlannedCourse, "plan_course_id" | "code" | "name">;
  semester: ImportedSemester;
  options: SectionOption[];
  /** CRNs chosen now, preselected. */
  chosen: string[];
  /** Typed meetings that choosing a section would replace. */
  typedMeetings: number;
};

/**
 * The picker for a course in a linked plan, or null when the plan isn't
 * linked, the course isn't in it, or the semester doesn't offer it. Only
 * this course's sections reach the browser.
 */
export async function getSectionPicker(plan: PlanDetails, planCourseId: string): Promise<SectionPicker | null> {
  const planned = plan.courses.find((course) => course.plan_course_id === planCourseId);
  if (!plan.semester || !planned) return null;

  const sections = await readCourseSections(plan.semester.id, planned.course_id, plan.student_id);
  if (!sections) return null;

  return {
    planned: { plan_course_id: planned.plan_course_id, code: planned.code, name: planned.name },
    semester: plan.semester,
    options: sectionOptions(sections),
    chosen: (planned.sections ?? []).map((section) => section.crn),
    typedMeetings: planned.meetings.filter((meeting) => meeting.source === "manual").length,
  };
}

/** One course's sections in a semester's active snapshot; null when not offered or unreadable. */
export async function readCourseSections(semesterId: string, courseId: string, userId: string): Promise<ResisSection[] | null> {
  const supabase = await createClient();
  const { data: semester, error: semesterError } = await supabase
    .from("resis_semesters")
    .select("active_import_id")
    .eq("id", semesterId)
    .maybeSingle<{ active_import_id: string | null }>();
  if (semesterError) log.warn("planner.sections.read_failure", { semesterId, code: semesterError.code ?? null }, { userId });
  if (!semester?.active_import_id) return null;

  const { data, error } = await supabase
    .from("course_offerings")
    .select("sections")
    .eq("import_id", semester.active_import_id)
    .eq("course_id", courseId)
    .maybeSingle<{ sections: ResisSection[] }>();
  if (error) log.warn("planner.sections.read_failure", { semesterId, courseId, code: error.code ?? null }, { userId });
  return data && Array.isArray(data.sections) ? data.sections : null;
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

/** The longest range getCalendarData reads at once. */
export const CALENDAR_MAX_DAYS = 62;

type CalendarEventRow = {
  event_id: string;
  reminder_enabled: boolean;
  reminder_minutes_before: number;
  events: { id: string; title: string; starts_at: string; ends_at: string; location: string; status: string } | null;
  going_events: { event_id: string } | { event_id: string }[] | null;
};

/**
 * The chosen sections of these plans as the active snapshot of each linked
 * semester lists them, by CRN: where a section class's type and room come
 * from. Empty when there are none or they can't be read (classes then show
 * without them).
 */
async function chosenSectionDetails(plans: readonly PlanDetails[], userId: string): Promise<Map<string, ResisSection>> {
  const details = new Map<string, ResisSection>();
  const bySemester = new Map<string, Set<string>>();
  for (const plan of plans) {
    if (!plan.semester) continue;
    const courses = plan.courses.filter((planned) => planned.sections?.length).map((planned) => planned.course_id);
    if (!courses.length) continue;
    const set = bySemester.get(plan.semester.id) ?? new Set<string>();
    for (const course of courses) set.add(course);
    bySemester.set(plan.semester.id, set);
  }
  if (!bySemester.size) return details;

  const supabase = await createClient();
  const { data: semesters, error } = await supabase
    .from("resis_semesters")
    .select("id, active_import_id")
    .in("id", [...bySemester.keys()])
    .returns<{ id: string; active_import_id: string | null }[]>();
  if (error) {
    log.warn("planner.calendar.sections_read_failure", { code: error.code ?? null }, { userId });
    return details;
  }

  const wanted = new Set(plans.flatMap((plan) => plan.courses.flatMap((planned) => (planned.sections ?? []).map((section) => section.crn))));
  await Promise.all(
    (semesters ?? []).map(async (semester) => {
      if (!semester.active_import_id) return;
      const { data, error: offeringsError } = await supabase
        .from("course_offerings")
        .select("sections")
        .eq("import_id", semester.active_import_id)
        .in("course_id", [...(bySemester.get(semester.id) ?? [])])
        .returns<{ sections: ResisSection[] }[]>();
      if (offeringsError) {
        log.warn("planner.calendar.sections_read_failure", { semesterId: semester.id, code: offeringsError.code ?? null }, { userId });
        return;
      }
      for (const offering of data ?? []) {
        for (const section of Array.isArray(offering.sections) ? offering.sections : []) {
          if (wanted.has(section.crn)) details.set(section.crn, section);
        }
      }
    }),
  );
  return details;
}

/**
 * Everything on the signed-in student's calendar from `from` to `to`
 * (Beirut dates, YYYY-MM-DD, inclusive, at most CALENDAR_MAX_DAYS): class
 * sessions of every plan whose term reaches the range, typed and from AUB's
 * schedule (with their section, type and room); the plans' own items; saved
 * events with their going mark and cancelled state (as far as RLS shows
 * them); and event reminders. Also the plans it read and how many plans and
 * saved events the student has at all. Null when the range is invalid or
 * the data couldn't be read. Logs ids and counts only.
 */
export async function getCalendarData({ from, to }: { from: string; to: string }): Promise<CalendarData | null> {
  const user = await requireUser();
  const first = parseCalendarDate(from);
  const last = parseCalendarDate(to);
  if (!first || !last || last < first || addDays(first, CALENDAR_MAX_DAYS - 1) < last) return null;

  const supabase = await createClient();
  const [plans, saved, planCount, savedCount] = await Promise.all([
    // Items may sit up to 30 days outside their plan's classes.
    supabase
      .from("semester_plans")
      .select(PLAN_DETAIL_COLUMNS)
      .lte("starts_on", addDays(last, ITEM_WINDOW_DAYS))
      .gte("ends_on", addDays(first, -ITEM_WINDOW_DAYS))
      .order("starts_on", { ascending: true })
      .returns<PlanRow[]>(),
    // A day either side for Beirut's offset; a week later for reminders set up to 7 days before.
    supabase
      .from("saved_events")
      .select(
        "event_id, reminder_enabled, reminder_minutes_before, events!inner(id, title, starts_at, ends_at, location, status), going_events(event_id)",
      )
      .in("events.status", ["published", "cancelled"])
      .lt("events.starts_at", `${addDays(last, 9)}T00:00:00Z`)
      .gt("events.ends_at", `${addDays(first, -1)}T00:00:00Z`)
      .returns<CalendarEventRow[]>(),
    supabase.from("semester_plans").select("id", { count: "exact", head: true }),
    supabase.from("saved_events").select("event_id", { count: "exact", head: true }),
  ]);

  if (plans.error || saved.error) {
    log.error(
      "planner.calendar.read_failure",
      { plans: plans.error?.code ?? null, events: saved.error?.code ?? null },
      { userId: user.id },
    );
    return null;
  }

  const events: SavedCalendarEvent[] = (saved.data ?? []).flatMap((row) => {
    if (!row.events) return [];
    const going = Array.isArray(row.going_events) ? row.going_events.length > 0 : Boolean(row.going_events);
    const { id, title, starts_at, ends_at, location, status } = row.events;
    return [
      {
        id,
        title,
        starts_at,
        ends_at,
        location,
        going,
        cancelled: status === "cancelled",
        reminder_enabled: row.reminder_enabled,
        reminder_minutes_before: row.reminder_minutes_before,
      },
    ];
  });

  const planDetails = (plans.data ?? []).map(toPlanDetails);
  const details = await chosenSectionDetails(planDetails, user.id);
  const entries = calendarEntries({ plans: planDetails, events, from: first, to: last, details });
  log.info(
    "planner.calendar.read",
    { days: Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1, plans: planDetails.length, events: events.length, entries: entries.length },
    { userId: user.id },
  );
  return {
    entries,
    plans: planDetails.map(({ id, term, starts_on, ends_on }) => ({ id, term, starts_on, ends_on })),
    // A count that can't be read must not claim "no plans and no saved events".
    totals: {
      plans: planCount.error ? Math.max(1, planDetails.length) : (planCount.count ?? planDetails.length),
      savedEvents: savedCount.error ? Math.max(1, events.length) : (savedCount.count ?? events.length),
    },
  };
}

/** The /calendar page's view of `date` (SCRUM-244/245), or null when the calendar can't be read. Logs counts only. */
export async function loadCalendarView({
  view,
  date,
  now = new Date(),
}: {
  view: CalendarViewMode;
  date: string;
  now?: Date;
}): Promise<CalendarViewModel | null> {
  const user = await requireUser();
  const { from, to } = calendarRangeFor(view, date);
  const data = await getCalendarData({ from, to });
  if (!data) return null;

  const model = buildCalendarView({ view, date, today: beirutToday(now), now, data });
  const { counts } = model;
  log.info(
    "calendar.viewed",
    { view, classes: counts.classes, items: counts.items, events: counts.events, reminders: counts.reminders, overlaps: counts.overlaps },
    { userId: user.id },
  );
  if (counts.overlaps || counts.clashes) {
    log.info("calendar.overlaps.found", { view, overlaps: counts.overlaps, clashes: counts.clashes }, { userId: user.id });
  }
  return model;
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
