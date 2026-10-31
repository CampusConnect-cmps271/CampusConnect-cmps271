/**
 * Public API of the planner module (SCRUM-66/67). Import from
 * "@/modules/planner", never from a file inside it.
 *
 * Note: this barrel re-exports server-only code, so a Client Component must
 * not import it. Client Components inside the module import their siblings
 * directly.
 */

export {
  addCourse,
  addMeeting,
  createPlan,
  deletePlan,
  moveCourse,
  removeCourse,
  removeMeeting,
  updateMeeting,
  type MeetingActionState,
  type NewPlanState,
  type PlannerActionState,
} from "./actions";

export { getMyPlan, listMyPlans, searchCoursesForPlan } from "./queries";

export { creditHundredths, creditLabel, formatCredits, totalCreditHundredths } from "./credits";

export { PLAN_NOT_FOUND, plannerErrorMessage, type PlannerOperation } from "./errors";

export { courseSearchFilter, parsePlannerSearch } from "./search";

export {
  EMPTY_MEETING_FORM,
  meetingSchema,
  PLANNER_LIMITS,
  PLANNER_TIMEZONE,
  plannerIdSchema,
  planSchema,
  readMeetingForm,
  validateMeetingForm,
  type MeetingFieldErrors,
  type MeetingFormValues,
  type MeetingInput,
} from "./schema";

export {
  AUB_CALENDAR_SOURCE,
  availableTerms,
  beirutToday,
  formatTermDate,
  OFFICIAL_TERMS,
  officialTerm,
  openTerms,
  TERM_PATTERN,
  type OfficialTerm,
} from "./terms";

export {
  formatMeeting,
  minutesFromTime,
  sortMeetings,
  timeFromMinutes,
  weekdayLabel,
  WEEKDAYS,
} from "./time";

export type {
  CourseSearchResult,
  Meeting,
  PlanDetails,
  PlannedCourse,
  PlanSummary,
  SemesterPlan,
  Weekday,
} from "./types";

export { NewPlanForm } from "./components/NewPlanForm";
export { PlanList } from "./components/PlanList";
export { PlannerNotice } from "./components/PlannerNotice";
export { PlanView } from "./components/PlanView";
