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
  it("keeps missing rating data unknown and matches terms late in catalogue descriptions", () => {
    const result = rankCandidates([{ ...base, name: "Exploration", description: Array.from({ length: 80 }, (_, i) => `topic${i}`).join(" ") + " robotics", review_count: null }], preferencesSchema.parse(preferences));
    expect(result[0].review_count).toBeNull(); expect(result[0].rationale).toContain("unavailable"); expect(result[0].rationale).toContain("robotics");
  });
  it("returns twenty results across departments and retains matching EECE courses for CS students", () => {
    const courses = Array.from({ length: 30 }, (_, index) => ({ ...base, id: `cmps-${index}`, code: `CMPS ${300 + index}`, name: "General computing", description: "Computing topics" }));
    const eece = { ...base, id: "eece", code: "EECE 463", department: "Electrical and Computer Engineering" };
    const result = rankCandidates([...courses, eece], preferencesSchema.parse(preferences), 20, "Computer Science");
    expect(result).toHaveLength(20);
    expect(result[0].code).toBe("EECE 463");
    expect(result[0].registration.status).toBe("review_required");
    expect(result[0].registration.message).toContain("petition may be required");
  });
  it("demotes explicit major exclusions without changing source restrictions", () => {
    const excluded = { ...base, id: "excluded", code: "CMPS 260", description: "Robotics. This course is not open for computer science majors." };
    const result = rankCandidates([excluded, base], preferencesSchema.parse(preferences), 20, "Computer Science");
    expect(result[0].course_id).toBe(base.id);
    expect(result[1].registration.status).toBe("restricted");
  });
});
