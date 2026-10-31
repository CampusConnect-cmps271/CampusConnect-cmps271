import { PLANNER_LIMITS } from "./schema";

export type PlannerOperation =
  | "createPlan"
  | "deletePlan"
  | "addCourse"
  | "removeCourse"
  | "moveCourse"
  | "saveMeeting"
  | "removeMeeting";

export const PLAN_NOT_FOUND = "This plan no longer exists, or it isn't yours.";

const FALLBACK: Record<PlannerOperation, string> = {
  createPlan: "We couldn't create the plan. Please try again.",
  deletePlan: "We couldn't delete the plan. Please try again.",
  addCourse: "We couldn't add the course. Please try again.",
  removeCourse: "We couldn't remove the course. Please try again.",
  moveCourse: "We couldn't move the course. Please try again.",
  saveMeeting: "We couldn't save the meeting. Please try again.",
  removeMeeting: "We couldn't remove the meeting. Please try again.",
};

/**
 * What to tell the student about a database error. Codes come from the
 * planner migration: 23505 duplicates, 23503 unknown course, 54000 caps,
 * 42501 RLS (not theirs), P0002 and 22023 from reorder_plan_courses.
 */
export function plannerErrorMessage(operation: PlannerOperation, code: string | null | undefined): string {
  switch (operation) {
    case "createPlan":
      if (code === "23505") return "You already have a plan for that term.";
      if (code === "54000") return `You can keep up to ${PLANNER_LIMITS.plans} plans. Delete one to start another.`;
      if (code === "23514") return "That term isn't available. Choose a term from the list.";
      break;
    case "addCourse":
      if (code === "23505") return "That course is already in this plan.";
      if (code === "23503") return "That course is no longer in the catalogue.";
      if (code === "54000") return `A plan can hold up to ${PLANNER_LIMITS.coursesPerPlan} courses.`;
      if (code === "42501") return PLAN_NOT_FOUND;
      break;
    case "moveCourse":
      if (code === "22023") return "The plan changed while you were reordering it. Please try again.";
      if (code === "P0002" || code === "42501") return PLAN_NOT_FOUND;
      break;
    case "saveMeeting":
      if (code === "23505") return "That meeting is already listed for this course.";
      if (code === "54000") return `A course can have up to ${PLANNER_LIMITS.meetingsPerCourse} meetings.`;
      if (code === "23514") return "Check the day and times: the meeting must end after it starts, on the same day.";
      if (code === "22023") return "That time zone isn't recognised. Use an IANA name such as Asia/Beirut.";
      if (code === "42501") return "That course isn't in one of your plans.";
      break;
    case "deletePlan":
    case "removeCourse":
    case "removeMeeting":
      if (code === "42501") return PLAN_NOT_FOUND;
      break;
  }
  return FALLBACK[operation];
}
