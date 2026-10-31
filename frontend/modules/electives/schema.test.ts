import { describe, expect, it } from "vitest";
import { preferencesSchema } from "./schema";
export const preferences = { interests: ["robotics"], preferred_workload: "moderate", academic_goals: "Learn design", completed_course_codes: ["cmps 101"] };
describe("elective preferences", () => {
  it("normalizes catalogue codes and retains Unicode interests", () => {
    const value = preferencesSchema.parse({ ...preferences, interests: ["فن", "فن"] });
    expect(value.completed_course_codes).toEqual(["CMPS 101"]); expect(value.interests).toEqual(["فن"]);
  });
  it("rejects empty, unbounded, and forged ownership inputs", () => {
    for (const change of [{ interests: [] }, { academic_goals: " " }, { preferred_workload: "easy" }, { academic_goals: "x".repeat(1001) }, { student_id: "another-user" }, { completed_course_codes: Array(61).fill("CMPS 101") }]) {
      expect(preferencesSchema.safeParse({ ...preferences, ...change }).success).toBe(false);
    }
  });
});
