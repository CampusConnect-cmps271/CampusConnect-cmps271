import { PLANNER_LIMITS } from "./schema";

export type PlannerOperation =
  | "createPlan"
  | "deletePlan"
  | "addCourse"
  | "removeCourse"
  | "moveCourse"
  | "saveItem"
  | "removeItem"
  | "going"
  | "linkSemester"
  | "chooseSections";

export const PLAN_NOT_FOUND = "This plan no longer exists, or it isn't yours.";

const FALLBACK: Record<PlannerOperation, string> = {
  createPlan: "We couldn't create the plan. Please try again.",
  deletePlan: "We couldn't delete the plan. Please try again.",
  addCourse: "We couldn't add the course. Please try again.",
  removeCourse: "We couldn't remove the course. Please try again.",
  moveCourse: "We couldn't move the course. Please try again.",
  saveItem: "We couldn't save the item. Please try again.",
  removeItem: "We couldn't remove the item. Please try again.",
  going: "We couldn't update the event. Please try again.",
  linkSemester: "We couldn't change the plan's schedule. Please try again.",
  chooseSections: "We couldn't save the sections. Please try again.",
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
    case "linkSemester":
      if (code === "42501") return "That semester's schedule isn't imported, or this plan isn't yours.";
      if (code === "23503") return "That semester's schedule isn't imported.";
      break;
    case "chooseSections":
      if (code === "22023") return "Those sections aren't in AUB's current schedule for this course. Reload the page and choose again.";
      if (code === "54000") return "That's too many sections for one course. Choose a section and at most what is linked to it.";
      if (code === "55000") return "Link this plan to AUB's imported schedule first.";
      if (code === "42501") return "That course isn't in one of your plans.";
      break;
    case "saveItem":
      if (code === "23514") return "Check the date and times: the date must be near the plan's term, and the item must end after it starts.";
      if (code === "23503") return "That course is no longer in this plan.";
      if (code === "54000") return `A plan can hold up to ${PLANNER_LIMITS.itemsPerPlan} items.`;
      if (code === "42501") return PLAN_NOT_FOUND;
      break;
    case "going":
      if (code === "23503") return "Save this event first, then mark it as going.";
      if (code === "42501") return "That event isn't one of your saved events.";
      break;
    case "deletePlan":
    case "removeCourse":
    case "removeItem":
      if (code === "42501") return PLAN_NOT_FOUND;
      break;
  }
  return FALLBACK[operation];
}
