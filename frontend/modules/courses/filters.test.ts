import { describe, expect, it } from "vitest";
import { courseFilterError, coursesUrl, hasRatingFilters, parseCourseFilters } from "./search";
import { courseUrl } from "./references";

describe("shareable course range filters", () => {
  it("accepts inclusive decimal bounds, zero credits and repeated URL parameters", () => {
    expect(parseCourseFilters({ creditsMin: ["0", "4"], creditsMax: "3.25", difficultyMin: "1",
      difficultyMax: "3.3", workloadMin: "2.5", workloadMax: "5" })).toEqual({
      query: "", department: "", page: 1, creditsMin: 0, creditsMax: 3.25,
      difficultyMin: 1, difficultyMax: 3.3, workloadMin: 2.5, workloadMax: 5,
    });
  });
  it.each(["", " ", "NaN", "Infinity", "3e0", "0x3", "3junk", "3,code.eq.secret", "-1", "1000", "3.333"])(
    "ignores invalid credit bounds without passing raw input to the query: %s", (value) => {
      expect(parseCourseFilters({ creditsMin: value }).creditsMin).toBeUndefined();
    },
  );
  it.each(["0", "0.9", "5.1", "3.33", "1e0", "Infinity", "-3", "" ])("ignores invalid rating bounds: %s", (value) => {
    expect(parseCourseFilters({ difficultyMin: value, workloadMax: value })).not.toHaveProperty("difficultyMin");
    expect(parseCourseFilters({ difficultyMin: value, workloadMax: value })).not.toHaveProperty("workloadMax");
  });
  it("retains inverted bounds for a visible correction instead of silently broadening the search", () => {
    for (const [minimum, maximum, label] of [
      ["creditsMin", "creditsMax", "Credits"], ["difficultyMin", "difficultyMax", "Difficulty"], ["workloadMin", "workloadMax", "Workload"],
    ]) {
      const filters = parseCourseFilters({ [minimum]: "5", [maximum]: "2" });
      expect(courseFilterError(filters)).toBe(`${label}: the minimum cannot be greater than the maximum.`);
      expect(new URL(coursesUrl(filters), "https://example.test").searchParams.get(minimum)).toBe("5");
    }
  });
  it("preserves every bound in pagination, detail and prerequisite URLs", () => {
    const filters = parseCourseFilters({ q: "CMPS & x=1", department: "Computer Science", page: "2",
      creditsMin: "0", creditsMax: "4", difficultyMin: "1", difficultyMax: "3.3", workloadMin: "2", workloadMax: "4.5" });
    const expected = { q: "CMPS & x=1", department: "Computer Science", creditsMin: "0", creditsMax: "4",
      difficultyMin: "1", difficultyMax: "3.3", workloadMin: "2", workloadMax: "4.5", page: "3" };
    expect(Object.fromEntries(new URL(coursesUrl(filters, 3), "https://example.test").searchParams)).toEqual(expected);
    expect(Object.fromEntries(new URL(courseUrl("CMPS 271", { ...filters, page: 3 }), "https://example.test").searchParams)).toEqual(expected);
    expect(parseCourseFilters(Object.fromEntries(new URL(coursesUrl(filters), "https://example.test").searchParams))).toEqual(filters);
  });
  it("uses the ratings source only for an active difficulty or workload bound", () => {
    expect(hasRatingFilters(parseCourseFilters({ creditsMin: "0" }))).toBe(false);
    expect(hasRatingFilters(parseCourseFilters({ difficultyMin: "1" }))).toBe(true);
    expect(hasRatingFilters(parseCourseFilters({ workloadMax: "5" }))).toBe(true);
  });
});
