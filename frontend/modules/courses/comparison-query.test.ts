import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), select: vi.fn(), in: vi.fn(), ratings: vi.fn(), logError: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/modules/ratings/queries", () => ({ getCourseRatings: mocks.ratings }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.logError } }));
import { ComparisonUnavailable, getCourseComparison } from "./comparison-query";

const first = { id: "10000000-0000-4000-8000-000000000001", code: "CMPS 240", name: "Operating Systems", credits: 3, department: "Computer Science", prerequisites: "CMPS 101 or instructor consent.\nMinimum C+." };
const second = { ...first, id: "10000000-0000-4000-8000-000000000002", code: "MATH 201", name: "Calculus", department: "Mathematics", credits: 0, prerequisites: "" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ in: mocks.in });
  mocks.in.mockResolvedValue({ data: [second, first], error: null });
  mocks.ratings.mockResolvedValue(new Map());
});

describe("authenticated course comparison reads", () => {
  it("reads at most three exact codes in one request and preserves selection order", async () => {
    const result = await getCourseComparison(["cmps240", "MATH 201"]);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("courses");
    expect(mocks.in).toHaveBeenCalledExactlyOnceWith("code", ["CMPS 240", "MATH 201"]);
    expect(result.courses).toEqual([first, second]);
    expect(result.courses[0].prerequisites).toBe(first.prerequisites);
    expect(mocks.ratings).toHaveBeenCalledExactlyOnceWith([first.id, second.id]);
  });
  it("requires authentication before validating input or reading data", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("redirect"));
    await expect(getCourseComparison([])).rejects.toThrow("redirect");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([[], ["CMPS 240"], ["cmps240", "CMPS-240"], ["bad", "MATH 201"], ["CMPS 101", "CMPS 102", "CMPS 103", "CMPS 104"]].map((values) => ({ values })))("rejects invalid selections before querying: $values", async ({ values }) => {
    await expect(getCourseComparison(values)).rejects.toThrow("Choose two or three");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("reports missing or RLS-hidden courses separately instead of fabricating values", async () => {
    mocks.in.mockResolvedValue({ data: [first], error: null });
    expect(await getCourseComparison(["CMPS 240", "MATH 201"])).toMatchObject({ courses: [first], missing: ["MATH 201"] });
    expect(mocks.ratings).toHaveBeenCalledExactlyOnceWith([first.id]);
  });
  it("accepts fractional numeric credits without rounding the original value", async () => {
    mocks.in.mockResolvedValue({ data: [{ ...first, credits: "3.25" }, second], error: null });
    expect((await getCourseComparison(["CMPS 240", "MATH 201"])).courses[0].credits).toBe(3.25);
  });
  it.each([null, [{ ...first, credits: null }], [first, first], [{ ...first, code: "CMPS 999" }]].map((data) => ({ data })))("rejects malformed or unrelated database rows: $data", async ({ data }) => {
    mocks.in.mockResolvedValue({ data, error: null });
    await expect(getCourseComparison(["CMPS 240", "MATH 201"])).rejects.toThrow(ComparisonUnavailable);
    expect(mocks.ratings).not.toHaveBeenCalled();
  });
  it("keeps safe rating failure states without hiding course facts", async () => {
    mocks.ratings.mockResolvedValue(new Map([[first.id, { status: "unavailable" }], [second.id, { status: "insufficient", reviewCount: 0 }]]));
    const result = await getCourseComparison(["CMPS 240", "MATH 201"]);
    expect(result.courses).toHaveLength(2);
    expect(result.ratings.get(first.id)).toEqual({ status: "unavailable" });
  });
  it("does not mask an authentication interrupt from the rating entry point", async () => {
    mocks.ratings.mockRejectedValueOnce(new Error("redirect"));
    await expect(getCourseComparison(["CMPS 240", "MATH 201"])).rejects.toThrow("redirect");
  });
  it("logs only an error code for a failed database response", async () => {
    mocks.in.mockResolvedValue({ data: null, error: { code: "57014", message: "private database details" } });
    await expect(getCourseComparison(["CMPS 240", "MATH 201"])).rejects.toThrow(ComparisonUnavailable);
    expect(mocks.logError).toHaveBeenCalledExactlyOnceWith("courses.comparison.read_failure", { code: "57014" });
  });
  it("converts a transport exception into a safe retry state", async () => {
    mocks.in.mockRejectedValueOnce(new Error("private connection details"));
    await expect(getCourseComparison(["CMPS 240", "MATH 201"])).rejects.toThrow(ComparisonUnavailable);
    expect(mocks.logError).toHaveBeenCalledWith("courses.comparison.read_failure", { code: "connection_failure" });
  });
});
