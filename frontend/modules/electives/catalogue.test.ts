import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
import type { SemesterOffering } from "@/modules/courses/semesters";
import { loadCandidates } from "./catalogue";

const course = (index: number) => ({ id: `course-${index}`, code: `COURSE ${String(index).padStart(4, "0")}`, name: "Synthetic course", description: "", department: "Testing", prerequisites: "", credits: 3 });
let rows: (ReturnType<typeof course> & Partial<SemesterOffering>)[];
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
  mocks.from.mockImplementation((table: string) => ({ select: () => table === "courses" || table === "course_semester_catalogue" ? {
    eq: (column: string, value: string) => {
      expect(column).toBe("semester_id");
      expect(value).toBe("202720");
      return { order: () => ({ range: async (start: number, end: number) => ({ data: rows.filter(row => row.semester_id === value).slice(start, end + 1), error: null }) }) };
    },
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
it("only loads ratings for complete interest matches while searching every catalogue page", async () => {
  rows[5] = { ...rows[5], name: "Software engineering", description: "Security testing" };
  rows[8] = { ...rows[8], name: "Software engineering" };
  rows[9] = { ...rows[9], code: "CMPS 243", name: "Software security" };
  rows[2380] = { ...rows[2380], code: "EECE 699", name: "Cryptography" };
  const result = await loadCandidates({ interests: ["software security", "cryptography"], completed_course_codes: ["CMPS 243"], preferred_workload: "moderate", academic_goals: "security" });
  expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  expect(result.courses).toHaveLength(2381);
  expect(batches).toEqual([["course-5", "course-2380"]]);
  expect(result.courses[5].review_count).toBe(3);
  expect(result.courses[2380].review_count).toBe(3);
  expect(result.courses[8].review_count).toBeNull();
  expect(result.courses[9].review_count).toBeNull();
});
it("skips rating requests entirely when no complete interest group matches", async () => {
  const result = await loadCandidates({ interests: ["software security"], completed_course_codes: [], preferred_workload: "moderate", academic_goals: "security" });
  expect(result.courses).toHaveLength(2381);
  expect(batches).toEqual([]);
  expect(mocks.from).toHaveBeenCalledTimes(3);
});

it("loads only the selected semester and carries the matching section facts into candidates", async () => {
  const section = { crn: "20904", section: "1", title: "Robotics", credits: 3, instructors: ["Alice"], attributes: ["Science"],
    prerequisites: "CMPS 101", campus: "Main", details_url: null, source_updated_at: null, restrictions: null,
    sessions: [{ days: "MW", start: "09:00", end: "10:15", location: "Test Hall", instructor: "Alice", type: "Lecture" }] };
  rows = [{ ...course(0), name: "Robotics", semester_id: "202720", semester_name: "Spring 2026-2027", synced_at: "2026-11-08T00:00:00Z", sections: [section] },
    { ...course(1), name: "Robotics", semester_id: "202710", sections: [section] },
    { ...course(2), name: "Robotics", semester_id: "202720", sections: [{ ...section, instructors: ["Bob"] }] }];
  const result = await loadCandidates({ interests: ["robotics"], preferred_workload: "light", academic_goals: "Learn", completed_course_codes: [],
    offering_preferences: { semester_id: "202720", instructors: ["Alice"], earliest_start: "09:00", latest_end: "10:15" } });
  expect(result.courses.map(row => row.id)).toEqual(["course-0"]);
  expect(result.courses[0].offering?.sections[0].crn).toBe("20904");
  expect(batches).toEqual([["course-0"]]);
  expect(mocks.from).toHaveBeenCalledWith("course_semester_catalogue");
});
