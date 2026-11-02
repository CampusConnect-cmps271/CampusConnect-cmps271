import { describe, expect, it } from "vitest";
import { parsePreferenceValues, preferencesSchema, preferenceValues, readPreferences } from "./schema";
import { electivePreferencesFixture as preferences } from "./test-fixtures";
describe("elective preferences", () => {
  it("normalizes catalogue codes and retains Unicode interests", () => {
    const value = preferencesSchema.parse({ ...preferences, interests: ["فن", "فن"], completed_course_codes: [" cmps   101 ", "CMPS 101"] });
    expect(value.completed_course_codes).toEqual(["CMPS 101"]); expect(value.interests).toEqual(["فن"]);
  });
  it.each([
    ["empty interests", { interests: [] }],
    ["blank interest", { interests: [" "] }],
    ["too many interests", { interests: Array(11).fill("robotics") }],
    ["oversized interest", { interests: ["x".repeat(61)] }],
    ["blank goals", { academic_goals: " " }],
    ["oversized goals", { academic_goals: "x".repeat(1001) }],
    ["invalid workload", { preferred_workload: "easy" }],
    ["forged ownership", { student_id: "another-user" }],
    ["too many course codes", { completed_course_codes: Array(61).fill("CMPS 101") }],
    ["oversized course code", { completed_course_codes: ["x".repeat(33)] }],
    ["control character in interest", { interests: ["robot\u0000ics"] }],
    ["control character in goals", { academic_goals: "learn\nrobotics" }],
    ["control character in course code", { completed_course_codes: ["CMPS\t101"] }],
  ] as const)("rejects %s", (_name, change) => {
    expect(preferencesSchema.safeParse({ ...preferences, ...change }).success).toBe(false);
  });
  it("accepts the input boundaries and optional empty completed courses", () => {
    const value = { ...preferences, interests: Array.from({ length: 10 }, (_, i) => String(i) + "x".repeat(59)), academic_goals: "x".repeat(1000), completed_course_codes: Array.from({ length: 60 }, (_, i) => "TEST " + String(i).padStart(27, "0")) };
    expect(preferencesSchema.parse(value)).toEqual(value);
    expect(preferencesSchema.parse({ ...preferences, completed_course_codes: [] }).completed_course_codes).toEqual([]);
  });
  it("normalizes a Unicode draft without losing its academic goals", () => {
    const parsed = parsePreferenceValues({ interests: " تعلم الآلة, فن, فن ", preferred_workload: "heavy", academic_goals: " تعلم تصميم الروبوتات ", completed_course_codes: "cmps 101, CMPS 101" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ interests: ["تعلم الآلة", "فن"], preferred_workload: "heavy", academic_goals: "تعلم تصميم الروبوتات", completed_course_codes: ["CMPS 101"] });
  });
  it("reads only expected text fields and rejects a missing or non-text value", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(preferenceValues(preferences))) form.set(key, value);
    form.set("student_id", "forged-owner");
    expect(readPreferences(form)).toEqual(preferenceValues(preferences));
    form.set("academic_goals", new File(["unexpected upload"], "goals.txt"));
    expect(parsePreferenceValues(readPreferences(form)).success).toBe(false);
    expect(parsePreferenceValues(readPreferences(new FormData())).success).toBe(false);
  });
});
