import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { recommend } from "./recommendations";
import type { Candidate } from "./types";
const preferences = { interests: ["robotics"], preferred_workload: "light", academic_goals: "Learn design", completed_course_codes: [] };
const course: Candidate = { id: "course-one", code: "CMPS 201", name: "Robotics", description: "Robotics design", department: "CMPS", credits: 3, prerequisites: "CMPS 101 or consent", review_count: 0, average_workload: null, average_overall: null };
const catalogue = { courses: [course], truncated: false };
describe("bounded recommendation service", () => {
  it("works without provider credentials", async () => {
    const result = await recommend(preferences, catalogue);
    expect(result.mode).toBe("baseline"); expect(result.recommendations[0].prerequisite_status).toBe("unknown");
  });
  it("accepts grounded results without changing catalogue facts", async () => {
    const result = await recommend(preferences, catalogue, async () => ({ items: [{ course_id: course.id, rationale: "Robotics matches your interests.", evidence_review_ids: [] }] }));
    expect(result.mode).toBe("provider"); expect(result.recommendations[0].prerequisite_status).toBe("unknown"); expect(result.recommendations[0].code).toBe(course.code);
  });
  it("falls back on failures, invented courses, citations, duplicates and malformed output", async () => {
    const item = { course_id: course.id, rationale: "Explore this course.", evidence_review_ids: [] };
    for (const value of [{ items: [{ ...item, course_id: "fabricated" }] }, { items: [{ ...item, evidence_review_ids: ["private-review"] }] }, { items: [item, item] }, { items: [] }, { items: [{ ...item, rationale: "x".repeat(801) }] }, "invalid"]) {
      const result = await recommend(preferences, catalogue, async () => value); expect(result.providerStatus).toBe("failed"); expect(result.recommendations[0].course_id).toBe(course.id);
    }
    expect((await recommend(preferences, catalogue, async () => { throw new Error("timeout"); })).mode).toBe("baseline");
  });
  it("bounds preferences and handles no available courses", async () => {
    await expect(recommend({ ...preferences, student_id: "forged" }, catalogue)).rejects.toThrow();
    const provider = vi.fn(); expect((await recommend(preferences, { courses: [], truncated: false }, provider)).recommendations).toEqual([]); expect(provider).not.toHaveBeenCalled();
  });
  it("keeps twenty results and authoritative registration guidance with partial AI output", async () => {
    const courses = Array.from({ length: 25 }, (_, index) => ({ ...course, id: `eece-${index}`, code: `EECE ${400 + index}`, department: "Electrical and Computer Engineering" }));
    const result = await recommend(preferences, { courses, truncated: false }, async () => ({ items: [{ course_id: "eece-0", rationale: "Explore robotics.", evidence_review_ids: [] }] }), { major: "Computer Science", majorStatus: "known" });
    expect(result.recommendations).toHaveLength(20);
    expect(result.catalogueCount).toBe(25);
    expect(result.studentMajor).toBe("Computer Science");
    expect(result.recommendations[0].registration.message).toContain("petition may be required");
  });
  it("accepts twenty grounded provider items", async () => {
    const courses = Array.from({ length: 20 }, (_, index) => ({ ...course, id: `course-${index}`, code: `CMPS ${300 + index}` }));
    const result = await recommend(preferences, { courses, truncated: false }, async () => ({ items: courses.map(row => ({ course_id: row.id, rationale: "Explore robotics.", evidence_review_ids: [] })) }));
    expect(result.mode).toBe("provider");
    expect(result.recommendations).toHaveLength(20);
  });
  it("only supplies complete interest matches to a provider and skips it when none match", async () => {
    const partial = { ...course, id: "partial", name: "Software design", description: "General computing" };
    const full = { ...course, id: "full", name: "Software security", description: "Cryptography" };
    const input = { ...preferences, interests: ["software security"] };
    const provider = vi.fn().mockResolvedValue({ items: [{ course_id: full.id, rationale: "Software security matches your interest.", evidence_review_ids: [] }] });
    const result = await recommend(input, { courses: [partial, full], truncated: false }, provider);
    expect(result.recommendations.map(row => row.course_id)).toEqual([full.id]);
    expect(provider.mock.calls[0][1].candidates.map((row: { course_id: string }) => row.course_id)).toEqual([full.id]);
    provider.mockClear();
    expect((await recommend(input, { courses: [partial], truncated: false }, provider)).recommendations).toEqual([]);
    expect(provider).not.toHaveBeenCalled();
  });
});
