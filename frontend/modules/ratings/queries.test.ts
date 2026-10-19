import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), from: vi.fn(), log: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.log } }));
import { getCourseRatings } from "./queries";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (course_id = id(1)) => ({ course_id, review_count: 3,
  average_difficulty: 2, average_workload: 3, average_usefulness: 4, average_overall: 5 });
const calls: { table: string; columns: string; field: string; ids: string[] }[] = [];
let respond: (ids: string[]) => { data: unknown; error: { code: string; message?: string } | null };

beforeEach(() => {
  vi.clearAllMocks(); calls.length = 0;
  mocks.auth.mockResolvedValue({ id: "verified-student" });
  mocks.client.mockResolvedValue({ from: mocks.from });
  respond = (ids) => ({ data: ids.map((value) => row(value)), error: null });
  mocks.from.mockImplementation((table: string) => ({
    select: (columns: string) => ({
      in: async (field: string, ids: string[]) => {
        calls.push({ table, columns, field, ids });
        return respond(ids);
      },
    }),
  }));
});

describe("authenticated course rating queries", () => {
  it("lets authentication redirects escape before creating a database client", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("redirect"));
    await expect(getCourseRatings([id(1)])).rejects.toThrow("redirect");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("does not issue an unfiltered query for an empty catalogue page", async () => {
    expect(await getCourseRatings([])).toEqual(new Map());
    expect(mocks.auth).toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("reads a page of 24 distinct course IDs in one narrow query", async () => {
    const ids = Array.from({ length: 24 }, (_, n) => id(n));
    const result = await getCourseRatings([...ids, ids[0]]);
    expect(result.size).toBe(24);
    expect(calls).toEqual([{
      table: "course_rating_averages", field: "course_id", ids,
      columns: "course_id,review_count,average_difficulty,average_workload,average_usefulness,average_overall",
    }]);
    expect(result.get(ids[0])).toMatchObject({ status: "ready", reviewCount: 3 });
  });
  it("bounds larger ID lists without dropping later courses", async () => {
    const ids = Array.from({ length: 205 }, (_, n) => id(n));
    const result = await getCourseRatings(ids);
    expect(calls.map((call) => call.ids.length)).toEqual([100, 100, 5]);
    expect(result.get(ids[204])?.status).toBe("ready");
  });
  it("distinguishes a zero-review course from a missing view row", async () => {
    respond = () => ({ data: [{ course_id: id(1), review_count: 0,
      average_difficulty: null, average_workload: null, average_usefulness: null, average_overall: null }], error: null });
    const result = await getCourseRatings([id(1), id(2)]);
    expect(result.get(id(1))).toEqual({ status: "insufficient", reviewCount: 0 });
    expect(result.get(id(2))).toEqual({ status: "unavailable" });
  });
  it("returns safe unavailable states for a missing view or database permission failure", async () => {
    respond = () => ({ data: null, error: { code: "PGRST205", message: "Private schema information" } });
    expect((await getCourseRatings([id(1)])).get(id(1))).toEqual({ status: "unavailable" });
    expect(mocks.log).toHaveBeenCalledWith("ratings.read_failure", { code: "PGRST205" });
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("Private");
  });
  it("handles transport failures without hiding the course catalogue", async () => {
    mocks.client.mockRejectedValueOnce(new Error("Secret connection details"));
    expect((await getCourseRatings([id(1)])).get(id(1))).toEqual({ status: "unavailable" });
    expect(mocks.log).toHaveBeenCalledWith("ratings.read_failure", { code: "connection_failure" });
  });
  it.each([null, [{ ...row(), average_overall: 0 }], [{ ...row(), review_count: -1 }]])(
    "rejects malformed rating results instead of displaying invented values", async (data) => {
      respond = () => ({ data, error: null });
      expect((await getCourseRatings([id(1)])).get(id(1))).toEqual({ status: "unavailable" });
    },
  );
  it("ignores unrelated rows instead of exposing an unrequested course", async () => {
    respond = () => ({ data: [row(id(1)), row(id(2))], error: null });
    const result = await getCourseRatings([id(1)]);
    expect(result.size).toBe(1);
    expect(result.has(id(2))).toBe(false);
  });
});
