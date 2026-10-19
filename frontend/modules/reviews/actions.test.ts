import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), from: vi.fn(), restrictions: vi.fn(), revalidate: vi.fn(), log: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/modules/moderation/restrictions", () => ({ checkContentRestrictions: mocks.restrictions }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.log, warn: mocks.log } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { deleteMyReview, saveMyReview } from "./actions";
import { getMyReview } from "./queries";

const userId = "00000000-0000-4000-8000-000000000001";
const courseId = "10000000-0000-4000-8000-000000000001";
const reviewId = "20000000-0000-4000-8000-000000000001";
const version = "2026-10-18T12:00:00.123456+00:00";
const calls: { table: string; method: string; payload?: unknown; filters: unknown[][] }[] = [];
let courseResult: { data: unknown; error: null | { code: string } };
let reviewResult: { data: unknown; error: null | { code: string; message?: string } };

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  Object.entries({ courseId, reviewId: "", updatedAt: "", difficulty: "2", workload: "3", usefulness: "5", overall: "4",
    semester: " Fall 2026 ", body: " Useful projects. ", completedCourse: "on", ...fields }).forEach(([key, value]) => data.set(key, value));
  return data;
};
const idle = { status: "idle" as const };
beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  courseResult = { data: { id: courseId, code: "CMPS 240" }, error: null };
  reviewResult = { data: { id: reviewId }, error: null };
  mocks.user.mockResolvedValue({ id: userId });
  mocks.restrictions.mockResolvedValue({ allowed: true });
  mocks.from.mockImplementation((table: string) => {
    const call = { table, method: "select", filters: [] as unknown[][], payload: undefined as unknown };
    calls.push(call);
    const query = {
      select: () => query,
      insert: (payload: unknown) => { call.method = "insert"; call.payload = payload; return query; },
      update: (payload: unknown) => { call.method = "update"; call.payload = payload; return query; },
      delete: () => { call.method = "delete"; return query; },
      eq: (field: string, value: string) => { call.filters.push([field, value]); return query; },
      maybeSingle: async () => table === "courses" ? courseResult : reviewResult,
    };
    return query;
  });
});

describe("review server actions", () => {
  it("authenticates before validating or querying", async () => {
    mocks.user.mockRejectedValueOnce(new Error("redirect"));
    await expect(saveMyReview(idle, form({ courseId: "bad" }))).rejects.toThrow("redirect");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("validates on the server and makes no query for invalid input", async () => {
    expect(await saveMyReview(idle, form({ body: " ", completedCourse: "" }))).toMatchObject({ status: "error", errors: { body: expect.any(Array), completedCourse: expect.any(Array) } });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("creates as the verified student, ignores spoofed fields and invalidates the current course", async () => {
    expect(await saveMyReview(idle, form({ student_id: "someone-else", created_at: "2001" }))).toMatchObject({ status: "saved" });
    expect(calls[1]).toMatchObject({ table: "course_reviews", method: "insert", payload: {
      course_id: courseId, student_id: userId, difficulty_rating: 2, workload_rating: 3,
      usefulness_rating: 5, overall_rating: 4, semester_taken: "Fall 2026", body: "Useful projects.", completed_course: true,
    } });
    expect(calls[1].payload).not.toHaveProperty("created_at");
    expect(mocks.restrictions).toHaveBeenCalledWith({ userId, contentType: "review", body: "Useful projects.", excludeId: undefined });
    expect(mocks.revalidate).toHaveBeenCalledWith("/courses/CMPS-240");
    expect(mocks.revalidate).toHaveBeenCalledWith("/courses/[code]", "page");
  });
  it("scopes updates to the review, course, owner and original timestamp", async () => {
    expect(await saveMyReview(idle, form({ reviewId, updatedAt: version }))).toMatchObject({ status: "saved" });
    expect(calls[1].method).toBe("update");
    expect(calls[1].filters).toEqual([["id", reviewId], ["course_id", courseId], ["student_id", userId], ["updated_at", version]]);
    expect(calls[1].payload).not.toHaveProperty("course_id");
    expect(calls[1].payload).not.toHaveProperty("student_id");
    expect(mocks.restrictions.mock.calls[0][0].excludeId).toBe(reviewId);
  });
  it("fails closed on restriction rejection without writing or logging review text", async () => {
    mocks.restrictions.mockResolvedValue({ allowed: false, rule: "blocked_language", message: "Revise your review." });
    expect(await saveMyReview(idle, form())).toEqual({ status: "error", message: "Revise your review." });
    expect(calls).toHaveLength(1);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("Useful projects.");
  });
  it("fails closed if the restriction checker cannot run", async () => {
    mocks.restrictions.mockRejectedValueOnce(new Error("private failure"));
    expect(await saveMyReview(idle, form())).toMatchObject({ status: "error" });
    expect(calls).toHaveLength(1);
  });
  it.each(["23505", "42501", "57014"])("returns a safe message for write error %s", async (code) => {
    reviewResult = { data: null, error: { code, message: "private database details" } };
    const result = await saveMyReview(idle, form());
    expect(result.status).toBe("error");
    expect(result.message).not.toContain("private");
    if (code === "23505") expect(result.message).toContain("already have a review");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("detects stale or unauthorized updates rather than reporting success", async () => {
    reviewResult = { data: null, error: null };
    expect(await saveMyReview(idle, form({ reviewId, updatedAt: version }))).toMatchObject({ status: "error", message: expect.stringContaining("changed or is no longer available") });
  });
  it("checks the course exists before moderation or writing", async () => {
    courseResult = { data: null, error: null };
    expect(await saveMyReview(idle, form())).toMatchObject({ status: "error", message: "This course is no longer available." });
    expect(mocks.restrictions).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });
  it("requires authentication and explicit confirmation for deletion", async () => {
    expect(await deleteMyReview(idle, form({ reviewId, updatedAt: version }))).toMatchObject({ status: "error" });
    expect(calls).toHaveLength(0);
    mocks.user.mockRejectedValueOnce(new Error("redirect"));
    await expect(deleteMyReview(idle, form())).rejects.toThrow("redirect");
  });
  it("deletes only the caller's unchanged review without running publication restrictions", async () => {
    expect(await deleteMyReview(idle, form({ reviewId, updatedAt: version, confirmDelete: "yes" }))).toMatchObject({ status: "deleted" });
    expect(calls[1]).toMatchObject({ method: "delete", filters: [["id", reviewId], ["course_id", courseId], ["student_id", userId], ["updated_at", version]] });
    expect(mocks.restrictions).not.toHaveBeenCalled();
  });
  it("does not claim deletion of another user's or a stale review", async () => {
    reviewResult = { data: null, error: null };
    expect(await deleteMyReview(idle, form({ reviewId, updatedAt: version, confirmDelete: "yes" }))).toMatchObject({ status: "error" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("returns a safe error if deletion fails", async () => {
    reviewResult = { data: null, error: { code: "42501", message: "private" } };
    expect(await deleteMyReview(idle, form({ reviewId, updatedAt: version, confirmDelete: "yes" }))).toMatchObject({ status: "error", message: expect.not.stringContaining("private") });
  });
});

describe("own-review loading", () => {
  it("filters the query by course and the verified current student", async () => {
    expect(await getMyReview(courseId)).toEqual({ available: true, review: { id: reviewId } });
    expect(calls[0].filters).toEqual([["course_id", courseId], ["student_id", userId]]);
  });
  it("distinguishes no review from an unavailable query", async () => {
    reviewResult = { data: null, error: null };
    expect(await getMyReview(courseId)).toEqual({ available: true, review: null });
    reviewResult = { data: null, error: { code: "57014" } };
    expect(await getMyReview(courseId)).toEqual({ available: false, review: null });
  });
  it("does not swallow authentication redirects", async () => {
    mocks.user.mockRejectedValueOnce(new Error("redirect"));
    await expect(getMyReview(courseId)).rejects.toThrow("redirect");
    expect(calls).toHaveLength(0);
  });
});
