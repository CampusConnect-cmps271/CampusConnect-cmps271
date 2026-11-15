import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { CourseSection } from "@/modules/courses/semesters";
import { matchingOffering, sectionMatches } from "./offering-matches";
import { rankCandidates } from "./ranking";
import { recommend } from "./recommendations";
import { parsePreferenceValues, preferencesSchema, preferenceValues } from "./schema";
import { electivePreferencesFixture } from "./test-fixtures";

const section = (change: Partial<CourseSection> = {}): CourseSection => ({
  crn: "20904", section: "1", title: "Robotics", credits: 3, instructors: ["Alice"], attributes: ["Writing"],
  prerequisites: "CMPS 202 or EECE 330", campus: "Main Campus", details_url: null, source_updated_at: null, restrictions: null,
  sessions: [{ days: "MW", start: "09:00", end: "10:15", location: "Test Hall", instructor: "Alice", type: "Lecture" }], ...change,
});
const offering = { semester_id: "202720", semester_name: "Spring 2026-2027", synced_at: "2026-11-08T00:00:00Z", sections: [section(), section({ crn: "20905", section: "2", instructors: ["Bob"], attributes: ["Science"] })] };

describe("elective semester and section matching", () => {
  it("requires all preferences to match one section, rather than merging facts across sections", () => {
    expect(matchingOffering(offering, { semester_id: "202720", instructors: ["Alice"], attributes: ["Science"] })).toBeNull();
    const selected = matchingOffering(offering, { semester_id: "202720", instructors: ["bob"], attributes: ["science"] });
    expect(selected?.sections.map(s => s.section)).toEqual(["2"]);
    expect(matchingOffering(offering, { semester_id: "202710" })).toBeNull();
  });
  it("matches any preferred instructor, all required attributes, and inclusive time boundaries", () => {
    expect(sectionMatches(section(), { instructors: ["Nobody", "alice (P)"], attributes: ["WRITING"], meeting_days: ["M", "W"], earliest_start: "09:00", latest_end: "10:15" })).toBe(true);
    expect(sectionMatches(section(), { attributes: ["Writing", "Science"] })).toBe(false);
    expect(sectionMatches(section(), { earliest_start: "09:01" })).toBe(false);
    expect(sectionMatches(section(), { latest_end: "10:14" })).toBe(false);
  });
  it("checks every listed lecture/lab meeting and excludes unknown schedules only when relevant", () => {
    const withLab = section({ sessions: [...section().sessions, { ...section().sessions[0], days: "F", type: "Lab" }] });
    expect(sectionMatches(withLab, { meeting_days: ["M", "W"] })).toBe(false);
    expect(sectionMatches(section({ sessions: [] }), {})).toBe(true);
    expect(sectionMatches(section({ sessions: [] }), { earliest_start: "08:00" })).toBe(false);
    expect(sectionMatches(section({ sessions: [{ ...section().sessions[0], days: "TBA", start: "TBA" }] }), { meeting_days: ["T"] })).toBe(false);
    expect(sectionMatches(section({ sessions: [{ ...section().sessions[0], start: "TBA" }] }), { latest_end: "18:00" })).toBe(false);
  });
  it("does not treat Thursday's R as Tuesday's T", () => {
    const row = section({ sessions: [{ ...section().sessions[0], days: "TR" }] });
    expect(sectionMatches(row, { meeting_days: ["T"] })).toBe(false);
    expect(sectionMatches(row, { meeting_days: ["T", "R"] })).toBe(true);
  });
  it("keeps actual matched sections and richer catalogue prerequisites in recommendations", async () => {
    const preferences = { ...electivePreferencesFixture, interests: ["robotics"], offering_preferences: { semester_id: "202720", instructors: ["Bob"] } };
    const base = { id: "a", code: "CMPS 271", name: "Robotics", description: "Robotics", department: "Computing", credits: 3, prerequisites: "Minimum C+ in CMPS 202 or EECE 330.", review_count: 0, average_workload: null, average_overall: null };
    const candidates = [{ ...base, offering }, { ...base, id: "wrong-term", offering: { ...offering, semester_id: "202710" } }, { ...base, id: "no-offering" }];
    const ranked = rankCandidates(candidates, preferences);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].offering?.sections.map(s => s.section)).toEqual(["2"]);
    expect(ranked[0].prerequisites).toContain("Minimum C+");
    expect(ranked[0].prerequisite_status).toBe("unknown");
    const result = await recommend(preferences, { courses: candidates, truncated: false }, async () => ({ items: [{ course_id: "wrong-term", rationale: "Try an unavailable term", evidence_review_ids: [] }] }));
    expect(result.mode).toBe("baseline");
    expect(result.recommendations.map(r => r.course_id)).toEqual(["a"]);
  });
});

describe("offering preference validation and form round trips", () => {
  it("preserves legacy preferences and round-trips the optional fields", () => {
    expect(preferencesSchema.parse(electivePreferencesFixture)).toEqual(electivePreferencesFixture);
    const parsed = parsePreferenceValues({ ...preferenceValues(electivePreferencesFixture), semester_id: "202720", instructors: "Alice, Bob", attributes: "Science", meeting_days: "M,W", earliest_start: "09:00", latest_end: "16:00" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.offering_preferences).toEqual({ semester_id: "202720", instructors: ["Alice", "Bob"], attributes: ["Science"], meeting_days: ["M", "W"], earliest_start: "09:00", latest_end: "16:00" });
      expect(preferenceValues(parsed.data).meeting_days).toBe("M,W");
    }
  });
  it.each([
    { instructors: ["Alice"] }, { semester_id: "bad" }, { semester_id: "202720", meeting_days: ["X"] },
    { semester_id: "202720", earliest_start: "24:00" }, { semester_id: "202720", earliest_start: "16:00", latest_end: "09:00" },
    { semester_id: "202720", instructors: Array(11).fill("Alice") }, { semester_id: "202720", student_id: "another-user" },
  ])("rejects invalid or forged offering preferences: %j", (offering_preferences) => {
    expect(preferencesSchema.safeParse({ ...electivePreferencesFixture, offering_preferences }).success).toBe(false);
  });
});
