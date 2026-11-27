import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), bundle: vi.fn(), logError: vi.fn(),
}));
vi.mock("./catalogue-cache", () => ({ loadSharedCatalogueBundle: async () => null }));
vi.mock("./semesters", () => ({ getImportedSemesters: async () => [] }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.logError } }));

import { getCourseCatalogue } from "./catalogue";
import { courseSearchExpression, coursesUrl, parseCourseFilters } from "./search";

type Response = { data: unknown; error: { code: string; message?: string } | null; count?: number };
const calls: { table: string; fields: string; head: boolean; count?: string; filters: unknown[][]; range?: number[]; order: string[] }[] = [];
let respond: (call: typeof calls[number]) => Response;

const id = "00000000-0000-4000-8000-000000000001";
function bundled() { return { courses: [{ id, code: "CMPS 240", name: "Algorithms", department: "Computer Science", credits: 3, description: "Synthetic." }], total: 1, page: 1, pages: 1, departments: ["Computer Science"], semesters: [], ratings: [{ course_id: id, review_count: 0, average_difficulty: null, average_workload: null, average_usefulness: null, average_overall: null }] }; }

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  respond = (call) => call.head ? { count: 1, data: null, error: null }
    : { data: call.fields === "department" ? [{ department: "Computer Science" }]
      : [{ id: "one", code: "CMPS 240", name: "Algorithms", department: "Computer Science", credits: 3, description: "Algorithms and analysis." }], error: null };
  mocks.bundle.mockResolvedValue({ data: bundled(), error: null });
  mocks.rpc.mockImplementation((name: string, args: unknown) => {
    if (name === "browse_course_catalogue") return mocks.bundle(args);
    const call = { table: name, fields: "department", head: false, filters: [], order: [], range: undefined as number[] | undefined };
    return { range(start: number, end: number) {
      call.range = [start, end]; calls.push(call);
      return Promise.resolve(respond(call));
    } };
  });
  mocks.from.mockImplementation((table: string) => ({
    select(fields: string, options?: { head?: boolean; count?: string }) {
      const call = { table, fields, head: options?.head ?? false, count: options?.count, filters: [] as unknown[][], order: [] as string[], range: undefined as number[] | undefined };
      calls.push(call);
      const query = {
        overrideTypes: () => query,
        eq: (column: string, value: string) => { call.filters.push([column, value]); return query; },
        or: (expression: string) => { call.filters.push([expression]); return query; },
        gte: (column: string, value: number) => { call.filters.push(["gte", column, value]); return query; },
        lte: (column: string, value: number) => { call.filters.push(["lte", column, value]); return query; },
        order: (column: string) => { call.order.push(column); return query; },
        range: (start: number, end: number) => { call.range = [start, end]; return query; },
        then: (resolve: (value: Response) => unknown) => Promise.resolve(respond(call)).then(resolve),
      };
      return query;
    },
  }));
});

describe("course request parsing", () => {
  it("bounds untrusted input and normalizes repeated parameters and invalid pages", () => {
    expect(parseCourseFilters({ q: ["  CMPS\n 240 ", "other"], department: " Computer Science ", page: "-1" }))
      .toEqual({ query: "CMPS 240", department: "Computer Science", page: 1 });
    for (const page of ["Infinity", "1.5", "2junk", "0", "9007199254740993"]) {
      expect(parseCourseFilters({ page }).page).toBe(1);
    }
    expect(parseCourseFilters({ q: "x".repeat(200), page: "999999" }).query).toHaveLength(120);
    expect(parseCourseFilters({ page: "999999" }).page).toBe(10000);
  });

  it("preserves filters in pagination links without creating URL parameters from text", () => {
    const filters = { query: "CMPS & x=1", department: "Arts & Sciences", page: 3 };
    const url = new URL(coursesUrl(filters, 2), "https://example.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: filters.query, department: filters.department, page: "2" });
    expect(coursesUrl({ query: "", department: "", page: 1 })).toBe("/courses");
  });

  it("keeps filter operators inside quoted values and escapes SQL LIKE wildcards", () => {
    const input = '50%_\\",department.neq.secret)';
    const expression = courseSearchExpression(input);
    const quoted = expression.match(/^code\.ilike\.("(?:\\.|[^"\\])*"),name\.ilike\.("(?:\\.|[^"\\])*")$/);
    expect(quoted).not.toBeNull();
    expect(JSON.parse(quoted![1])).toBe('%50\\%\\_\\\\",department.neq.secret)%');
    expect(JSON.parse(quoted![2])).toBe(JSON.parse(quoted![1]));
    expect(courseSearchExpression("cmps240")).toContain('code.ilike."%cmps 240%"');
  });
});

describe("course catalogue queries", () => {
  it("scopes semester courses before rating predicates, counts and pagination", async () => {
    await getCourseCatalogue(parseCourseFilters({ semester: "202720", difficultyMax: "3.3" }));
    const queries = calls.filter((call) => call.fields !== "department");
    expect(queries.map((call) => call.table)).toEqual(["course_semester_catalogue", "course_semester_catalogue"]);
    expect(queries[0].filters).toEqual([["semester_id", "202720"], ["lte", "difficulty", 3.3]]);
    expect(queries[0].filters).toEqual(queries[1].filters);
  });
  it("applies all ranges in Postgres identically before counting and paginating", async () => {
    await getCourseCatalogue(parseCourseFilters({ q: "CMPS", department: "Computer Science",
      creditsMin: "0", creditsMax: "3.5", difficultyMin: "2.5", difficultyMax: "3.3", workloadMin: "1", workloadMax: "4" }));
    const queries = calls.filter((call) => call.fields !== "department");
    expect(queries.map((call) => call.table)).toEqual(["course_filter_catalogue", "course_filter_catalogue"]);
    expect(queries[0].filters).toEqual(queries[1].filters);
    expect(queries[0].filters).toEqual([
      ["department", "Computer Science"], [courseSearchExpression("CMPS")],
      ["gte", "credits", 0], ["lte", "credits", 3.5], ["gte", "difficulty", 2.5],
      ["lte", "difficulty", 3.3], ["gte", "workload", 1], ["lte", "workload", 4],
    ]);
  });

  it("returns an actionable range error without issuing an invalid course query", async () => {
    const result = await getCourseCatalogue(parseCourseFilters({ creditsMin: "6", creditsMax: "3" }));
    expect(result.filterError).toBe("Credits: the minimum cannot be greater than the maximum.");
    expect(result.courses).toEqual([]);
    expect(calls.map((call) => call.fields)).toEqual(["department"]);
  });

  it("does not silently return unfiltered courses if the rating-filter view fails", async () => {
    const initial = respond;
    respond = (call) => call.table === "course_filter_catalogue"
      ? { data: null, error: { code: "PGRST205", message: "Private schema details" } } : initial(call);
    await expect(getCourseCatalogue(parseCourseFilters({ difficultyMax: "3" }))).rejects.toThrow("temporarily unavailable");
    expect(calls.filter((call) => call.fields !== "department").every((call) => call.table === "course_filter_catalogue")).toBe(true);
  });

  it("checks authentication before querying the catalogue", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("redirect"));
    await expect(getCourseCatalogue(parseCourseFilters({}))).rejects.toThrow("redirect");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("loads the normal catalogue in one request including credit bounds and ratings", async () => {
    const result = await getCourseCatalogue(parseCourseFilters({ q: "CMPS240", department: "Computer Science", creditsMin: "0", creditsMax: "3.5", page: "2" }));
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("browse_course_catalogue", { p_query: "CMPS240", p_code_query: "CMPS 240", p_department: "Computer Science", p_page: 2, p_credits_min: 0, p_credits_max: 3.5 });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result.ratings?.get(id)).toEqual({ status: "insufficient", reviewCount: 0 });
  });

  it("keeps every department from a large metadata response", async () => {
    const data = bundled(); data.departments = Array.from({ length: 1001 }, (_, i) => `Department ${i}`);
    mocks.bundle.mockResolvedValue({ data, error: null });
    expect((await getCourseCatalogue(parseCourseFilters({}))).departments).toHaveLength(1001);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("preserves catalogue results when ratings cannot be loaded", async () => {
    mocks.bundle.mockResolvedValue({ data: { ...bundled(), ratings: null }, error: null });
    const result = await getCourseCatalogue(parseCourseFilters({}));
    expect(result.courses).toHaveLength(1);expect(result.ratings?.get(id)).toEqual({ status: "unavailable" });
  });

  it("rejects invalid catalogue payloads without inventing successful empty results", async () => {
    mocks.bundle.mockResolvedValue({ data: { ...bundled(), total: -1 }, error: null });
    await expect(getCourseCatalogue(parseCourseFilters({}))).rejects.toThrow("temporarily unavailable");
    expect(mocks.logError).toHaveBeenCalledWith("courses.catalogue.read_failure", { code: "invalid_data" });
  });

  it("reports bundle errors without leaking database text", async () => {
    mocks.bundle.mockResolvedValue({ data: null, error: { code: "57014", message: "Private server details" } });
    await expect(getCourseCatalogue(parseCourseFilters({}))).rejects.toThrow("The course catalogue is temporarily unavailable.");
    expect(mocks.logError).toHaveBeenCalledWith("courses.catalogue.read_failure", { code: "57014" });
  });

  it("uses the same safe unavailable state for transport errors", async () => {
    mocks.bundle.mockRejectedValue(new Error("Private network details"));
    await expect(getCourseCatalogue(parseCourseFilters({}))).rejects.toThrow("temporarily unavailable");
  });
});
