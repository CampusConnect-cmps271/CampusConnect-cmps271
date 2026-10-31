import { describe, expect, it } from "vitest";
import { PLAN_NOT_FOUND, plannerErrorMessage } from "./errors";

describe("plannerErrorMessage", () => {
  it("explains duplicates, unknown courses, caps and other students' plans when adding a course", () => {
    expect(plannerErrorMessage("addCourse", "23505")).toBe("That course is already in this plan.");
    expect(plannerErrorMessage("addCourse", "23503")).toBe("That course is no longer in the catalogue.");
    expect(plannerErrorMessage("addCourse", "54000")).toBe("A plan can hold up to 12 courses.");
    expect(plannerErrorMessage("addCourse", "42501")).toBe(PLAN_NOT_FOUND);
  });

  it("explains a second plan for a term and the plan cap", () => {
    expect(plannerErrorMessage("createPlan", "23505")).toBe("You already have a plan for that term.");
    expect(plannerErrorMessage("createPlan", "54000")).toBe("You can keep up to 10 plans. Delete one to start another.");
  });

  it("explains a reorder that raced another change, and a plan that isn't theirs", () => {
    expect(plannerErrorMessage("moveCourse", "22023")).toBe("The plan changed while you were reordering it. Please try again.");
    expect(plannerErrorMessage("moveCourse", "P0002")).toBe(PLAN_NOT_FOUND);
  });

  it("explains rejected meetings", () => {
    expect(plannerErrorMessage("saveMeeting", "23505")).toBe("That meeting is already listed for this course.");
    expect(plannerErrorMessage("saveMeeting", "54000")).toBe("A course can have up to 7 meetings.");
    expect(plannerErrorMessage("saveMeeting", "23514")).toMatch(/must end after it starts/);
    expect(plannerErrorMessage("saveMeeting", "22023")).toBe("Meetings use Asia/Beirut time for now.");
    expect(plannerErrorMessage("saveMeeting", "42501")).toBe("That course isn't in one of your plans.");
  });

  it("falls back to a retry message without database details", () => {
    expect(plannerErrorMessage("addCourse", "57014")).toBe("We couldn't add the course. Please try again.");
    expect(plannerErrorMessage("removeMeeting", undefined)).toBe("We couldn't remove the meeting. Please try again.");
    expect(plannerErrorMessage("deletePlan", null)).toBe("We couldn't delete the plan. Please try again.");
  });
});
