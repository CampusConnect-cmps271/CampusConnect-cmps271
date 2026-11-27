import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), caller: vi.fn(), warn: vi.fn(), error: vi.fn(),
  entries: new Map<string, unknown>(), update: vi.fn(), options: {} as Record<string, unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: m.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: m.admin }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.caller }) }));
vi.mock("@/modules/logging", () => ({ log: { warn: m.warn, error: m.error } }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keys: string[], options: Record<string, unknown>) => {
    m.options = options;
    // Deliberately no miss coalescing here: the application must prevent a
    // burst of cold concurrent callers from all hitting the database.
    return async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      if (m.entries.has(key)) return structuredClone(m.entries.get(key));
      const result = await fn(...args);
      m.entries.set(key, structuredClone(result));
      return result;
    };
  },
  updateTag: (...args: unknown[]) => { m.update(...args); m.entries.clear(); },
}));

import { getCourseCatalogue } from "./catalogue";
import { invalidateSharedCourseCatalogue, loadSharedCatalogueBundle } from "./catalogue-cache";
import { COURSE_CATALOGUE_TAG } from "./cache-tags";
import { parseCourseFilters } from "./search";

const id = "00000000-0000-4000-8000-000000000001";
const filters = () => parseCourseFilters({ q: "CMPS" });
function fixture() {
  return {
    courses: [{ id, code: "CMPS 240", name: "Algorithms", department: "Computing", credits: 3, description: "Shared reference text" }],
    total: 1, page: 1, pages: 1, departments: ["Computing"], semesters: [],
    ratings: [{ course_id: id, review_count: 0, average_difficulty: null, average_workload: null, average_usefulness: null, average_overall: null }],
  };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T08:00:00Z"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-only-key");
  vi.stubEnv("COURSE_CATALOGUE_CACHE_ENABLED", "true");
  invalidateSharedCourseCatalogue();
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ id: "student-a" });
  m.admin.mockImplementation(async () => ({ data: fixture(), error: null }));
  m.caller.mockImplementation(async () => ({ data: fixture(), error: null }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("shares a validated course bundle across students while authenticating every read", async () => {
  await getCourseCatalogue(filters());
  m.auth.mockResolvedValue({ id: "student-b" });
  const result = await getCourseCatalogue(filters());
  expect(result.courses[0].code).toBe("CMPS 240");
  expect(m.admin).toHaveBeenCalledTimes(1);
  expect(m.admin.mock.calls[0][0]).toBe("read_shared_course_catalogue");
  expect(m.caller).not.toHaveBeenCalled();
  expect(m.auth).toHaveBeenCalledTimes(4); // entry point + cache guard per read
  expect(m.options).toEqual({ revalidate: 60, tags: [COURSE_CATALOGUE_TAG] });
});
it("denies a signed-out caller even when the shared cache is warm", async () => {
  await getCourseCatalogue(filters());
  m.auth.mockRejectedValue(new Error("redirect"));
  await expect(getCourseCatalogue(filters())).rejects.toThrow("redirect");
  expect(m.admin).toHaveBeenCalledTimes(1);
  expect(m.caller).not.toHaveBeenCalled();
});
it("coalesces a burst of twenty cold requests into one database read", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => getCourseCatalogue(filters())));
  expect(m.admin).toHaveBeenCalledTimes(1);
  expect(results.every((r) => r.total === 1)).toBe(true);
});
it("separates filters and projects but ignores presentation-only comparison selection", async () => {
  await getCourseCatalogue(filters());
  await getCourseCatalogue({ ...filters(), query: "cmps", compare: ["MATH 201"] });
  expect(m.admin).toHaveBeenCalledTimes(1);
  await getCourseCatalogue({ ...filters(), department: "Computing" });
  await getCourseCatalogue({ ...filters(), creditsMin: 0 });
  await getCourseCatalogue({ ...filters(), page: 2 });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://other.supabase.co");
  await getCourseCatalogue(filters());
  expect(m.admin).toHaveBeenCalledTimes(5);
});
it("does not let callers mutate data subsequently served to another student", async () => {
  const first = await getCourseCatalogue(filters());
  first.courses[0].name = "Changed by caller";
  first.ratings?.clear();
  const next = await getCourseCatalogue(filters());
  expect(next.courses[0].name).toBe("Algorithms");
  expect(next.ratings?.get(id)).toEqual({ status: "insufficient", reviewCount: 0 });
});
it("falls back to caller RLS when the migration or shared cache source is unavailable", async () => {
  m.admin.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  expect((await getCourseCatalogue(filters())).total).toBe(1);
  await getCourseCatalogue(filters());
  expect(m.admin).toHaveBeenCalledTimes(1); // short failure backoff
  expect(m.caller).toHaveBeenCalledTimes(2);
  expect(m.entries.size).toBe(0);
  vi.setSystemTime(Date.now() + 10_001);
  m.admin.mockResolvedValue({ data: fixture(), error: null });
  await getCourseCatalogue(filters());
  expect(m.admin).toHaveBeenCalledTimes(2);
});
it.each(["invalid", "missing-ratings"])("does not cache an %s response", async (kind) => {
  const data = kind === "invalid" ? {} : { ...fixture(), ratings: null };
  m.admin.mockResolvedValue({ data, error: null });
  expect((await getCourseCatalogue(filters())).total).toBe(1);
  expect(m.entries.size).toBe(0);
  expect(m.caller).toHaveBeenCalledTimes(1);
});
it("strips unknown fields before persisting a cache entry and never keys by credentials", async () => {
  const data = { ...fixture(), email: "private@example.test", cookie: "private-cookie" };
  m.admin.mockResolvedValue({ data, error: null });
  await getCourseCatalogue(filters());
  const serialized = JSON.stringify([...m.entries]);
  expect(serialized).not.toMatch(/private@example|private-cookie|test-server-only-key|student-a/);
});
it("expires review-dependent data immediately after invalidation", async () => {
  await getCourseCatalogue(filters());
  const next = fixture();
  next.ratings[0].review_count = 1;
  Object.assign(next.ratings[0], { average_difficulty: 3, average_workload: 3, average_usefulness: 4, average_overall: 4 });
  m.admin.mockResolvedValue({ data: next, error: null });
  invalidateSharedCourseCatalogue();
  const result = await getCourseCatalogue(filters());
  expect(m.update).toHaveBeenCalledWith(COURSE_CATALOGUE_TAG);
  expect(result.ratings?.get(id)).toEqual({ status: "insufficient", reviewCount: 1 });
  expect(m.admin).toHaveBeenCalledTimes(2);
});
it("does not serve an entry older than two minutes during failed revalidation", async () => {
  await getCourseCatalogue(filters());
  vi.setSystemTime(Date.now() + 120_001);
  await getCourseCatalogue(filters());
  expect(m.caller).toHaveBeenCalledTimes(1);
});
it("supports disabling the cache and avoids caching rich filter paths", async () => {
  vi.stubEnv("COURSE_CATALOGUE_CACHE_ENABLED", "false");
  await getCourseCatalogue(filters());
  expect(m.admin).not.toHaveBeenCalled();
  expect(m.caller).toHaveBeenCalledTimes(1);
  vi.stubEnv("COURSE_CATALOGUE_CACHE_ENABLED", "true");
  expect(await loadSharedCatalogueBundle({ ...filters(), semester: "202720" })).toBeNull();
  expect(await loadSharedCatalogueBundle({ ...filters(), difficultyMin: 3 })).toBeNull();
  expect(m.admin).not.toHaveBeenCalled();
});
