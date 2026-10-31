import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: m.select }) }) }));
import { loadEvidence, summarizeEvidence } from "./evidence";
beforeEach(() => { vi.clearAllMocks(); const chain = { eq: m.eq, order: m.order, limit: m.limit }; m.select.mockReturnValue(chain); m.eq.mockReturnValue(chain); m.order.mockReturnValue(chain); });
it("retrieves only published, bounded evidence without student identifiers", async () => {
  m.limit.mockResolvedValue({ data: [{ id: "r1", course_id: "00000000-0000-4000-8000-000000000001", student_id: "must-not-leak", body: "Good course", overall_rating: 4, workload_rating: 2 }], error: null, count: 50 });
  const result = await loadEvidence("00000000-0000-4000-8000-000000000001");
  expect(m.eq).toHaveBeenCalledWith("status", "published"); expect(m.limit).toHaveBeenCalledWith(24);
  expect(m.select.mock.calls[0][0]).not.toContain("student_id"); expect(JSON.stringify(result)).not.toContain("must-not-leak");
  expect(result).toMatchObject({ total: 50, sampled: 1, truncated: true, positive: 1 });
});
it("preserves positive, negative, mixed and sparse sample metadata", () => {
  const reviews = [1, 3, 5].map((rating, i) => ({ id: `r${i}`, course_id: "course", body: "Review", overall_rating: rating, workload_rating: 3 }));
  expect(summarizeEvidence(reviews, 3)).toMatchObject({ positive: 1, negative: 1, mixed: 1, sampled: 3, truncated: false });
  expect(summarizeEvidence([], 0).sampled).toBe(0);
});
