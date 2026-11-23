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
  createPlan,
  deletePlan,
  markGoing,
  moveCourse,
  removeCourse,
  removeItem,
  unmarkGoing,
  updateItem,
  linkSemester,
  chooseSections,
  updateSectionTimes,
  type ItemActionState,
  type NewPlanState,
  type PlannerActionState,
} from "./actions";

export {
  CALENDAR_MAX_DAYS,
  checkPlanConflicts,
  getCalendarData,
  getEventPlannerState,
  getMyPlan,
  getPlanSectionState,
  getSectionPicker,
  listMyPlans,
  listSavedEventsNear,
  searchCoursesForPlan,
  type PlanSectionState,
  type SectionPicker,
} from "./queries";

export {
  calendarEntries,
  type CalendarData,
  reminderEntry,
  type CalendarDataEntry,
  type CalendarDataKind,
  type DaySlice,
  type SavedCalendarEvent,
} from "./calendar-data";

export {
  chosenCrns,
  linkedPrompt,
  importedOn,
  MAX_SECTIONS_PER_COURSE,
  SECTION_NOTICES,
  sectionCountLabel,
  sectionNoticeText,
  sectionOptions,
  sessionMeetings,
  sessionWhen,
  type LinkedGroup,
  type LinkedOption,
  type ResisSection,
  type ResisSession,
  type SectionNotice,
  type SectionOption,
  type SessionMeeting,
} from "./sections";

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
  itemSchema,
  PLANNER_LIMITS,
  plannerIdSchema,
  planSchema,
  readItemForm,
  validateItemForm,
  type ItemFieldErrors,
  type ItemFormValues,
  type ItemInput,
} from "./schema";

export {
  AUB_CALENDAR_SOURCE,
  availableTerms,
  beirutToday,
  formatTermDate,
  OFFICIAL_TERMS,
  officialTerm,
  openTerms,
  resisSemesterName,
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
  SemesterPlan,
  Weekday,
} from "./types";

export { EventGoingControl } from "./components/EventGoingControl";
export { NewPlanForm } from "./components/NewPlanForm";
export { PlanList } from "./components/PlanList";
export { PlanView } from "./components/PlanView";

export {
  calendarOccurrences,
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
