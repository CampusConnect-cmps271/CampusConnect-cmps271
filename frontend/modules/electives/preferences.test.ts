import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), user: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: m.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
import { saveMyPreferences } from "./preferences";
const input = { interests: ["فن"], preferred_workload: "light", academic_goals: "Learn design", completed_course_codes: [] };
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ id: "owner" }); m.upsert.mockResolvedValue({ error: null }); m.from.mockReturnValue({ upsert: m.upsert }); });
it("derives ownership from authentication", async () => {
  await saveMyPreferences(input); expect(m.upsert).toHaveBeenCalledWith({ ...input, student_id: "owner" }, { onConflict: "student_id" });
});
it("rejects unknown codes before writing", async () => {
  m.from.mockReturnValue({ select: () => ({ in: async () => ({ data: [], error: null }) }) });
  await expect(saveMyPreferences({ ...input, completed_course_codes: ["FAKE 999"] })).rejects.toThrow("catalogue");
  expect(m.upsert).not.toHaveBeenCalled();
});
it("does not expose database errors or write when signed out", async () => {
  m.upsert.mockResolvedValue({ error: { message: "private SQL details" } });
  await expect(saveMyPreferences(input)).rejects.toThrow("couldn't save");
  m.user.mockRejectedValue(new Error("redirect"));
  await expect(saveMyPreferences(input)).rejects.toThrow("redirect");
});
