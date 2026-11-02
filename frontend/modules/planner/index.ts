/**
 * Public API of the planner module (SCRUM-66/67 and the calendar). Import from
 * "@/modules/planner", never from a file inside it.
 *
 * Note: this barrel re-exports server-only code, so a Client Component must
 * not import it. Client Components inside the module import their siblings
 * directly.
 */

export {
  addCourse,
  addItem,
  addMeeting,
  createPlan,
  deletePlan,
  markGoing,
  moveCourse,
  removeCourse,
  removeItem,
  removeMeeting,
  unmarkGoing,
  updateItem,
  updateMeeting,
  type ItemActionState,
  type MeetingActionState,
  type NewPlanState,
  type PlannerActionState,
} from "./actions";

export {
  checkPlanConflicts,
  getEventPlannerState,
  getMyPlan,
  listMyPlans,
  listSavedEventsNear,
  searchCoursesForPlan,
} from "./queries";

export {
  addDays,
  calendarRange,
  classWeekLabel,
  formatEventWhen,
  formatItemWhen,
  formatWeekRange,
  ITEM_WINDOW_DAYS,
  itemWindow,
  mondayOf,
  parseCalendarDate,
  pickWeek,
  planCalendar,
  weekDates,
  weekEntries,
  type CalendarEntry,
  type CalendarEntryKind,
} from "./calendar";

export { creditHundredths, creditLabel, formatCredits, totalCreditHundredths } from "./credits";

export { PLAN_NOT_FOUND, plannerErrorMessage, type PlannerOperation } from "./errors";

export { courseSearchFilter, parsePlannerSearch } from "./search";

export {
  EMPTY_ITEM_FORM,
  EMPTY_MEETING_FORM,
  itemSchema,
  meetingSchema,
  PLANNER_LIMITS,
  PLANNER_TIMEZONE,
  plannerIdSchema,
  planSchema,
  readItemForm,
  readMeetingForm,
  validateItemForm,
  validateMeetingForm,
  type ItemFieldErrors,
  type ItemFormValues,
  type ItemInput,
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
  normalizeTimeZone,
  sortMeetings,
  timeFromMinutes,
  weekdayLabel,
  WEEKDAYS,
} from "./time";

export type {
  CourseSearchResult,
  Meeting,
  PlanDetails,
  PlanItem,
  PlannedCourse,
  PlannerEvent,
  PlanSummary,
  SemesterPlan,
  Weekday,
} from "./types";

export { EventGoingControl } from "./components/EventGoingControl";
export { NewPlanForm } from "./components/NewPlanForm";
export { PlanList } from "./components/PlanList";
export { PlannerNotice } from "./components/PlannerNotice";
export { PlanView } from "./components/PlanView";

export {
  calendarSlots,
  detectConflicts,
  DISPLAY_TIMEZONE,
  type CalendarSlot,
  type ConflictInput,
  type ConflictReport,
  type ConflictSide,
  type ConflictStatus,
  type EventSide,
  type InvalidEntry,
  type InvalidReason,
  type ItemSide,
  type MeetingSide,
  type ScheduleConflict,
  type UnknownCourse,
} from "./conflicts";

export { conflictHeadline, invalidItemHelp, invalidMeetingHelp, overlapDates, overlapWindow } from "./conflict-text";

export { CalendarWeek } from "./components/CalendarWeek";
export { ConflictPanel } from "./components/ConflictPanel";
export { EventsSection } from "./components/EventsSection";
