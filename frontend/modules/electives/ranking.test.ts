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
    const courses = Array.from({ length: 30 }, (_, index) => ({ ...base, id: `cmps-${index}`, code: `CMPS ${300 + index}`, name: "Robotics computing", description: "Computing topics" }));
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
  it("requires every word in one interest and treats comma-separated interests as alternatives", () => {
    const courses = [
      { ...base, id: "software-only", name: "Software design", description: "Software engineering" },
      { ...base, id: "security-only", name: "Security policy", description: "Security governance" },
      { ...base, id: "both", name: "Software engineering", description: "Security testing and auditing" },
      { ...base, id: "crypto", name: "Cryptography", description: "Encryption and mathematical protocols" },
    ];
    const result = rankCandidates(courses, preferencesSchema.parse({ ...preferences, interests: ["software security", "cryptography"] }));
    expect(result.map(row => row.course_id)).toEqual(["both", "crypto"]);
    expect(result[0].rationale).toContain("Catalogue interest matches: software security.");
    expect(result[1].rationale).toContain("Catalogue interest matches: cryptography.");
  });
  it("returns fewer than twenty matches and an empty list when there is no complete group", () => {
    const partial = { ...base, name: "Software design", description: "General computing" };
    expect(rankCandidates([partial], preferencesSchema.parse({ ...preferences, interests: ["software security"] }))).toEqual([]);
    expect(rankCandidates([base, partial], preferencesSchema.parse(preferences))).toHaveLength(1);
    expect(rankCandidates([base], preferencesSchema.parse({ ...preferences, interests: ["!!!"] }))).toEqual([]);
  });
  it("matches case, punctuation and Unicode consistently without substring or single-letter shortcuts", () => {
    const courses = [
      { ...base, id: "whole", name: "SOFTWARE-security", description: "" },
      { ...base, id: "substring", name: "Softwares and security", description: "" },
      { ...base, id: "arabic", name: "تعلم الآلة", description: "" },
      { ...base, id: "arabic-partial", name: "تعلم", description: "" },
      { ...base, id: "c", name: "C programming", description: "" },
      { ...base, id: "programming-only", name: "Programming", description: "" },
    ];
    const result = rankCandidates(courses, preferencesSchema.parse({ ...preferences, interests: ["ｓｏｆｔｗａｒｅ security", "تعلم الآلة", "C programming"] }));
    expect(result.map(row => row.course_id)).toEqual(["whole", "arabic", "c"]);
  });
  it("requires all words in a goal for its bonus and treats goal commas as alternatives", () => {
    const partial = { ...base, id: "partial", code: "CMPS 201", description: "Robotics security" };
    const full = { ...base, id: "full", code: "CMPS 301", description: "Robotics software security" };
    const other = { ...base, id: "other", code: "CMPS 302", description: "Robotics cryptography" };
    const result = rankCandidates([partial, full, other], preferencesSchema.parse({ ...preferences, academic_goals: "software security, cryptography" }));
    expect(result.map(row => row.course_id)).toEqual(["full", "other", "partial"]);
    expect(result[0].rationale).toContain("Academic goal matches: software security.");
    expect(result[1].rationale).toContain("Academic goal matches: cryptography.");
    expect(result[2].rationale).not.toContain("Academic goal matches");
  });
  it("counts a group once despite repeated words, casing or word order", () => {
    const security = { ...base, id: "security", code: "CMPS 301", name: "Software security", description: "" };
    const crypto = { ...base, id: "crypto", code: "CMPS 201", name: "Cryptography", description: "" };
    const result = rankCandidates([security, crypto], preferencesSchema.parse({ ...preferences, interests: ["software security", "SECURITY software software", "cryptography"], academic_goals: "Other topics" }));
    expect(result.map(row => row.course_id)).toEqual(["crypto", "security"]);
  });
});
