/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * The planned interface (SCRUM-66/67), plus the plan's official term dates,
 * which the conflict engine needs to place daylight-saving changes.
 */
export type SemesterPlan = {
  id: string;
  student_id: string;
  term: string;
  /** First day of classes, YYYY-MM-DD. */
  starts_on: string;
  /** Last day of classes, YYYY-MM-DD. */
  ends_on: string;
  /** Catalogue course ids in the student's order. */
  course_ids: string[];
};

/**
 * A weekly meeting time: typed by the student (source "manual", always
 * tentative), or one weekday of a section chosen from AUB's imported
 * schedule (source "resis", with its CRN; written only by the database).
 */
export type Meeting = {
  id: string;
  plan_course_id: string;
  weekday: Weekday;
  /** Minutes after local midnight, 0-1439. */
  start_minute: number;
  /** Minutes after local midnight, 1-1440, after start_minute. */
  end_minute: number;
  /** An IANA zone; section times are always Asia/Beirut. */
  timezone: string;
  source: "manual" | "resis";
  /** The chosen section a "resis" time comes from; null for typed times. */
  crn?: string | null;
};

/** A section of AUB's imported schedule chosen for a planned course (SCRUM-243). */
export type ChosenSection = {
  crn: string;
  /** Its number when chosen, e.g. "3" or "L1". */
  section: string;
  semester_id: string;
};

/** An imported Resis semester a plan can link to. */
export type ImportedSemester = {
  id: string;
  /** Resis's name, e.g. "Spring 2026-2027". */
  name: string;
  /** When its active snapshot was fetched from Resis. */
  synced_at: string | null;
};

/** A chosen section a newer snapshot changed or no longer has. */
export type SectionChange = {
  plan_course_id: string;
  crn: string;
  section: string;
  status: "changed" | "gone";
  /** When the active snapshot was fetched. */
  imported_at: string | null;
};

/** A catalogue course in a plan, with its current catalogue values. */
export type PlannedCourse = {
  plan_course_id: string;
  course_id: string;
  position: number;
  code: string;
  name: string;
  /** numeric(5,2) from the catalogue, as PostgREST sends it. */
  credits: number | string;
  /** Empty when it has no times yet: "No times yet". */
  meetings: Meeting[];
  /** Sections chosen from AUB's imported schedule; empty for typed times. */
  sections?: ChosenSection[];
};

/** Something the student added to a plan's calendar: an exam, a meeting, anything. */
export type PlanItem = {
  id: string;
  plan_id: string;
  /** The planned course it belongs to, if any. */
  plan_course_id: string | null;
  title: string;
  /** A Beirut calendar date, YYYY-MM-DD. */
  on_date: string;
  /** Minutes after Beirut midnight; both null for an all-day item. */
  start_minute: number | null;
  end_minute: number | null;
};

export type PlanDetails = SemesterPlan & {
  courses: PlannedCourse[];
  items: PlanItem[];
  /** The imported semester whose sections give class times, or null. */
  semester?: ImportedSemester | null;
};

/** A saved event near a plan's term. Only events the student is going to are on the calendar. */
export type PlannerEvent = {
  id: string;
  title: string;
  /** ISO timestamps. */
  starts_at: string;
  ends_at: string;
  location: string;
  going: boolean;
};

export type PlanSummary = {
  id: string;
  term: string;
  starts_on: string;
  ends_on: string;
  course_count: number;
  semester?: ImportedSemester | null;
};

export type CourseSearchResult = {
  id: string;
  code: string;
  name: string;
  credits: number | string;
  /**
   * On a linked plan: how many sections the imported semester has, or null
   * when it doesn't offer the course. Undefined on an unlinked plan.
   */
  section_count?: number | null;
};
