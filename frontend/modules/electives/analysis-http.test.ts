import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), evidence: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ getCurrentUser: m.user }));
vi.mock("@/modules/logging", () => ({ log: { error: vi.fn() } }));
vi.mock("./evidence", () => ({ loadEvidence: m.evidence }));
vi.mock("./http", () => ({ sameOrigin: (request: Request) => request.headers.get("origin") === "https://campus.example" }));
import { analysisPOST } from "./analysis-http";
const request = (body: unknown) => new Request("https://campus.example/api/electives/analysis", { method: "POST", headers: { origin: "https://campus.example", "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ id: "owner" }); m.evidence.mockResolvedValue({ reviews: [], total: 0, sampled: 0, truncated: false, positive: 0, negative: 0, mixed: 0 }); });
it("requires a signed-in caller and one bounded catalogue identifier", async () => {
  m.user.mockResolvedValue(null); expect((await analysisPOST(request({}))).status).toBe(401);
  m.user.mockResolvedValue({ id: "owner" }); expect((await analysisPOST(request({ course_id: "invalid" }))).status).toBe(400);
  expect((await analysisPOST(request("x".repeat(2000)))).status).toBe(400);
  expect(m.evidence).not.toHaveBeenCalled();
});
it("returns honest sparse evidence or a generic failure without breaking recommendations", async () => {
  const response = await analysisPOST(request({ course_id: "00000000-0000-4000-8000-000000000001" }));
  expect(await response.json()).toMatchObject({ sample: { sampled: 0 }, analysis: { reason: "insufficient_reviews" } });
  m.evidence.mockRejectedValue(new Error("private details"));
  const failed = await analysisPOST(request({ course_id: "00000000-0000-4000-8000-000000000001" }));
  expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("private details");
});
