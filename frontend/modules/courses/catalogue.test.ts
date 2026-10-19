import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), from: vi.fn(), logError: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.logError } }));

import { getCourseCatalogue } from "./catalogue";
import { courseSearchExpression, coursesUrl, parseCourseFilters } from "./search";

type Response = { data: unknown; error: { code: string; message?: string } | null; count?: number };
const calls: { fields: string; head: boolean; filters: unknown[][]; range?: number[]; order: string[] }[] = [];
let respond: (call: typeof calls[number]) => Response;

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  respond = (call) => call.head ? { count: 1, data: null, error: null }
    : { data: call.fields === "department" ? [{ department: "Computer Science" }]
      : [{ id: "one", code: "CMPS 240", name: "Algorithms", department: "Computer Science", credits: 3, description: "Algorithms and analysis." }], error: null };
  mocks.from.mockImplementation(() => ({
    select(fields: string, options?: { head?: boolean }) {
      const call = { fields, head: options?.head ?? false, filters: [] as unknown[][], order: [] as string[], range: undefined as number[] | undefined };
      calls.push(call);
      const query = {
        eq: (column: string, value: string) => { call.filters.push([column, value]); return query; },
        or: (expression: string) => { call.filters.push([expression]); return query; },
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
  it("checks authentication before querying the catalogue", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("redirect"));
    await expect(getCourseCatalogue(parseCourseFilters({}))).rejects.toThrow("redirect");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("applies the same name/code and department filters to count and paginated results", async () => {
    const result = await getCourseCatalogue(parseCourseFilters({ q: "CMPS240", department: "Computer Science" }));
    expect(result).toMatchObject({ total: 1, page: 1, pages: 1, departments: ["Computer Science"] });
    const courseQueries = calls.filter((call) => call.fields !== "department");
    expect(courseQueries).toHaveLength(2);
    expect(courseQueries[0].filters).toEqual(courseQueries[1].filters);
    expect(courseQueries[0].filters).toContainEqual(["department", "Computer Science"]);
    expect(courseQueries[1].range).toEqual([0, 23]);
    expect(courseQueries[1].order).toEqual(["department", "code", "id"]);
  });

  it("finds departments beyond the first thousand rows and deduplicates them", async () => {
    const initial = respond;
    respond = (call) => call.fields !== "department" ? initial(call) : {
      data: call.range?.[0] === 0 ? Array.from({ length: 1000 }, () => ({ department: "Computer Science" })) : [{ department: "Zoology" }], error: null,
    };
    const result = await getCourseCatalogue(parseCourseFilters({}));
    expect(result.departments).toEqual(["Computer Science", "Zoology"]);
    expect(calls.filter((call) => call.fields === "department").map((call) => call.range))
      .toEqual([[0, 999], [1000, 1999]]);
  });

  it("clamps a stale page to the last available page without skipping the remaining courses", async () => {
    const initial = respond;
    respond = (call) => call.head ? { data: null, count: 25, error: null } : initial(call);
    expect(await getCourseCatalogue(parseCourseFilters({ page: "1000" }))).toMatchObject({ page: 2, pages: 2, total: 25 });
    expect(calls.at(-1)?.range).toEqual([24, 47]);
  });

  it("handles an empty catalogue without requesting an invalid range", async () => {
    respond = (call) => call.head ? { data: null, count: 0, error: null } : { data: [], error: null };
    expect(await getCourseCatalogue(parseCourseFilters({}))).toEqual({ courses: [], departments: [], total: 0, page: 1, pages: 1 });
    expect(calls).toHaveLength(2);
  });

  it("turns a thrown connection error into the same safe unavailable state", async () => {
    mocks.from.mockImplementation(() => { throw new Error("private connection details"); });
    await expect(getCourseCatalogue(parseCourseFilters({}))).rejects.toThrow("The course catalogue is temporarily unavailable.");
    expect(mocks.logError).toHaveBeenCalledWith("courses.catalogue.read_failure", { code: "connection_failure" });
  });

  it.each(["department", "count", "rows"])("reports a %s failure without leaking database text", async (stage) => {
    const initial = respond;
    respond = (call) => (stage === "department" ? call.fields === "department"
      : stage === "count" ? call.head : !call.head && call.fields !== "department")
      ? { data: null, error: { code: "57014", message: "sensitive server details" } } : initial(call);
    await expect(getCourseCatalogue(parseCourseFilters({}))).rejects.toThrow("The course catalogue is temporarily unavailable.");
    expect(mocks.logError).toHaveBeenCalledWith("courses.catalogue.read_failure", { code: "57014" });
  });
});
