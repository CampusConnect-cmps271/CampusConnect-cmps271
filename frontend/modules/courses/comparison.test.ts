import { describe, expect, it } from "vitest";
import { parseComparisonSelection } from "./codes";
import { comparisonUrl, toggleComparison } from "./comparison";
import { courseUrl } from "./references";
import { coursesUrl, parseCourseFilters } from "./search";

describe("course comparison selection", () => {
  it("normalizes compact codes, suffixes and leading zeros in selection order", () => {
    expect(parseComparisonSelection(["cmps240", "bioc-303b", "GRDS 033"]).codes).toEqual(["CMPS 240", "BIOC 303B", "GRDS 033"]);
  });
  it("deduplicates equivalent codes so one course cannot be compared with itself", () => {
    expect(parseComparisonSelection(["cmps240", "CMPS-240", "CMPS 240"])).toEqual({ codes: ["CMPS 240"], error: undefined });
  });
  it.each(["", "not-a-code", "CMPS 240,code.neq.secret", "<script>", "X".repeat(100)])("rejects invalid selection input: %s", (value) => {
    expect(parseComparisonSelection([value, "MATH 201"])).toMatchObject({ codes: ["MATH 201"], error: expect.stringContaining("invalid") });
  });
  it("bounds overlarge URLs and rejects a fourth distinct course", () => {
    expect(parseComparisonSelection(Array(11).fill("CMPS 240"))).toEqual({ codes: [], error: "Choose no more than three courses." });
    expect(parseComparisonSelection(["CMPS 101", "CMPS 102", "CMPS 103", "CMPS 104"])).toEqual({ codes: ["CMPS 101", "CMPS 102", "CMPS 103"], error: "Choose no more than three courses." });
  });
  it("adds, removes and caps selections while preserving every browsing filter", () => {
    const filters = parseCourseFilters({ q: "CMPS", department: "Computer Science", page: "2", creditsMin: "0", difficultyMax: "3.3" });
    const one = toggleComparison(filters, "cmps240");
    const two = toggleComparison(one, "MATH-201");
    const three = toggleComparison(two, "GRDS 033");
    expect(toggleComparison(three, "CMPS 241")).toEqual(three);
    expect(toggleComparison(three, "bad")).toEqual(three);
    expect(toggleComparison(three, "cmps-240")).toEqual({ ...filters, compare: ["MATH 201", "GRDS 033"] });
  });
  it("retains repeated comparison parameters through pagination, details and comparison links", () => {
    const filters = parseCourseFilters({ q: "Arts & x=1", page: "2", compare: ["CMPS 240", "MATH 201"], creditsMax: "3.25" });
    for (const url of [coursesUrl(filters, 3), courseUrl("CMPS 240", filters), comparisonUrl(filters)]) {
      const params = new URL(url, "https://example.test").searchParams;
      expect(params.getAll("compare")).toEqual(["CMPS 240", "MATH 201"]);
      expect(params.get("q")).toBe("Arts & x=1");
      expect(params.get("creditsMax")).toBe("3.25");
    }
    expect(comparisonUrl(filters)).toMatch(/^\/courses\/compare\?/);
  });
  it("leaves old catalogue URLs and default parser output unchanged", () => {
    expect(parseCourseFilters({})).toEqual({ query: "", department: "", page: 1 });
    expect(coursesUrl({ query: "", department: "", page: 1, compare: [] })).toBe("/courses");
  });
});
