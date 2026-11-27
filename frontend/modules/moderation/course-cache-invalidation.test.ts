import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ role: vi.fn(), rpc: vi.fn(), invalidate: vi.fn(), path: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ requireRole: m.role }));
vi.mock("@/modules/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));
vi.mock("@/modules/courses/catalogue-cache", () => ({ invalidateSharedCourseCatalogue: m.invalidate }));
vi.mock("next/cache", () => ({ revalidatePath: m.path }));
import { moderateReportedContent } from "./actions";
const input = { targetType: "review", targetId: "00000000-0000-4000-8000-000000000001", decision: "remove", reason: "Reported content" };
beforeEach(() => { vi.resetAllMocks(); m.role.mockResolvedValue({ id: "moderator" }); m.rpc.mockResolvedValue({ error: null }); });
it("invalidates shared course ratings after successful review moderation", async () => {
  expect(await moderateReportedContent(input)).toEqual({ success: true });
  expect(m.invalidate).toHaveBeenCalledExactlyOnceWith();
});
it("does not invalidate or fetch data if role authorization fails", async () => {
  m.role.mockRejectedValue(new Error("forbidden"));
  await expect(moderateReportedContent(input)).rejects.toThrow("forbidden");
  expect(m.invalidate).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});
it("does not invalidate on a failed moderation write", async () => {
  m.rpc.mockResolvedValue({ error: { code: "42501" } });
  expect(await moderateReportedContent(input)).toHaveProperty("error");
  expect(m.invalidate).not.toHaveBeenCalled();
});
