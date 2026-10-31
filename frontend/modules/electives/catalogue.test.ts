import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
import { loadCandidates } from "./catalogue";

const course = (index: number) => ({ id: `course-${index}`, code: `COURSE ${String(index).padStart(4, "0")}`, name: "Synthetic course", description: "", department: "Testing", prerequisites: "", credits: 3 });
let rows: ReturnType<typeof course>[];
let ranges: number[][];
let batches: string[][];
let failRatings: "error" | "throw" | null;
let active: number;
let maximumActive: number;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  rows = Array.from({ length: 2381 }, (_, index) => course(index));
  ranges = []; batches = []; failRatings = null; active = 0; maximumActive = 0;
  mocks.from.mockImplementation((table: string) => ({ select: () => table === "courses" ? {
    order: () => ({ range: async (start: number, end: number) => {
      ranges.push([start, end]);
      return { data: rows.slice(start, end + 1), error: null };
    } }),
  } : {
    in: async (_column: string, ids: string[]) => {
      batches.push(ids); active++; maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 0));
      active--;
      if (failRatings === "throw") throw new Error("Synthetic transport failure");
      if (failRatings === "error") return { data: null, error: { code: "42501" } };
      return { data: ids.map(id => ({ course_id: id, review_count: "3", average_workload: "2.5", average_overall: null })), error: null };
    },
  } }));
});
it("loads a realistic catalogue in three pages with bounded concurrent rating reads", async () => {
  const result = await loadCandidates();
  expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  expect(result.courses).toHaveLength(2381);
  expect(result.truncated).toBe(false);
  expect(maximumActive).toBe(4);
  expect(batches.flat()).toEqual(rows.map(row => row.id));
  expect(batches.every(batch => batch.length <= 100)).toBe(true);
  expect(result.courses[2380]).toMatchObject({ review_count: 3, average_workload: 2.5, average_overall: null });
});
it.each(["error", "throw"] as const)("keeps unavailable rating data unknown on %s", async failure => {
  rows = rows.slice(0, 2); failRatings = failure;
  const result = await loadCandidates();
  expect(result.courses).toHaveLength(2);
  expect(result.courses[0]).toMatchObject({ review_count: null, average_workload: null, average_overall: null });
});
it("searches beyond 5,000 courses and includes departments late in the catalogue", async () => {
  rows = Array.from({ length: 6001 }, (_, index) => course(index));
  rows[6000] = { ...course(6000), code: "EECE 699", department: "Electrical and Computer Engineering" };
  const result = await loadCandidates();
  expect(result.courses).toHaveLength(6001);
  expect(result.truncated).toBe(false);
  expect(result.courses[6000].code).toBe("EECE 699");
  expect(batches.flat()).toContain("course-6000");
});
it("requires authentication before reading catalogue data", async () => {
  mocks.user.mockRejectedValue(new Error("redirect"));
  await expect(loadCandidates()).rejects.toThrow("redirect");
  expect(mocks.from).not.toHaveBeenCalled();
});
