import { describe, expect, it } from "vitest";
import { prerequisiteStatus, rankCandidates } from "./ranking";
import { preferencesSchema } from "./schema";
import type { Candidate } from "./types";
const base: Candidate = { id: "one", code: "CMPS 201", name: "Robotics design", description: "Learn robotics design", department: "CMPS", prerequisites: "CMPS 101", credits: 3, review_count: 0, average_workload: null, average_overall: null };
const preferences = { interests: ["robotics"], preferred_workload: "moderate", academic_goals: "Learn design", completed_course_codes: ["CMPS 101"] };
describe("catalogue ranking", () => {
  it("keeps ambiguous rules unknown and handles simple explicit requirements", () => {
    expect(prerequisiteStatus("CMPS 101 and CMPS 201", ["CMPS 101"])).toBe("unmet");
    expect(prerequisiteStatus("CMPS 101", ["CMPS 101"])).toBe("satisfied");
    for (const text of ["", "CMPS 101 or CMPS 102", "CMPS 101 and instructor consent", "CMPS 101, 102 or 103"]) expect(prerequisiteStatus(text, ["CMPS 101"])).toBe("unknown");
  });
  it("excludes completed courses, uses interest matches, and demotes unmet prerequisites", () => {
    const result = rankCandidates([base, { ...base, id: "two", code: "CMPS 101" }, { ...base, id: "three", code: "CMPS 300", prerequisites: "CMPS 299" }], preferencesSchema.parse(preferences));
    expect(result.map(row => row.code)).toEqual(["CMPS 201", "CMPS 300"]); expect(result[0].prerequisite_status).toBe("satisfied");
    expect(result[0].rationale).toContain("robotics"); expect(result[0].rationale).toContain("Too few reviews");
  });
  it("handles no candidates and preserves source prerequisite prose", () => {
    expect(rankCandidates([], preferencesSchema.parse(preferences))).toEqual([]);
    expect(rankCandidates([{ ...base, prerequisites: "CMPS 101 OR consent" }], preferencesSchema.parse(preferences))[0].prerequisites).toBe("CMPS 101 OR consent");
  });
});
