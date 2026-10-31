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

/** A weekly meeting time the student typed. Always tentative. */
export type Meeting = {
  id: string;
  plan_course_id: string;
  weekday: Weekday;
  /** Minutes after local midnight, 0-1439. */
  start_minute: number;
  /** Minutes after local midnight, 1-1440, after start_minute. */
  end_minute: number;
  /** An IANA zone; the planner offers only Asia/Beirut for now. */
  timezone: string;
  source: "manual";
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
  department: string;
  /** The catalogue's prose. CampusConnect does not check it. */
  prerequisites: string;
  /** Empty when the student has not typed any: "Schedule unknown". */
  meetings: Meeting[];
};

export type PlanDetails = SemesterPlan & { courses: PlannedCourse[] };

export type PlanSummary = {
  id: string;
  term: string;
  starts_on: string;
  ends_on: string;
  course_count: number;
};

export type CourseSearchResult = {
  id: string;
  code: string;
  name: string;
  credits: number | string;
  department: string;
};
