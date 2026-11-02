import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), evidence: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ getCurrentUser: m.user }));
vi.mock("@/modules/logging", () => ({ log: { error: vi.fn() } }));
vi.mock("./evidence", () => ({ loadEvidence: m.evidence }));
vi.mock("./http", () => ({ sameOrigin: (request: Request) => request.headers.get("origin") === "https://campus.example" }));
vi.mock("./provider", async importOriginal => ({ ...await importOriginal<typeof import("./provider")>(), configuredProvider: m.provider }));
import { analysisPOST } from "./analysis-http";
const request = (body: unknown) => new Request("https://campus.example/api/electives/analysis", { method: "POST", headers: { origin: "https://campus.example", "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); m.provider.mockReturnValue(undefined); m.user.mockResolvedValue({ id: "owner" }); m.evidence.mockResolvedValue({ reviews: [], total: 0, sampled: 0, truncated: false, positive: 0, negative: 0, mixed: 0 }); });
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
const sample = { reviews: [
  { id: "positive", course_id: "00000000-0000-4000-8000-000000000001", body: "Useful projects", overall_rating: 5, workload_rating: 2 },
  { id: "negative", course_id: "00000000-0000-4000-8000-000000000001", body: "Heavy workload", overall_rating: 1, workload_rating: 5 },
  { id: "mixed", course_id: "00000000-0000-4000-8000-000000000001", body: "Useful but demanding", overall_rating: 3, workload_rating: 4 },
], total: 3, sampled: 3, truncated: false, positive: 1, negative: 1, mixed: 1 };
const stage = { summary: "Mixed experiences.", uncertainty: "Only three reviews.", claims: [{ review_id: "positive", quote: "Useful projects", observation: "Projects were valued by a reviewer." }] };
it("returns the validated three-stage analysis through the authenticated endpoint", async () => {
  m.evidence.mockResolvedValue(sample);
  const provider = vi.fn().mockResolvedValue(stage);
  m.provider.mockReturnValue(provider);
  const response = await analysisPOST(request({ course_id: sample.reviews[0].course_id }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ sample, analysis: { status: "available", defender: stage, prosecutor: stage, judge: stage } });
  expect(provider.mock.calls.map(call => call[0])).toEqual(["defender", "prosecutor", "judge"]);
  expect(provider.mock.calls[2][1]).toMatchObject({ evidence: sample, defender: stage, prosecutor: stage });
  expect(JSON.stringify(provider.mock.calls)).not.toContain('"owner"');
});
it("rejects cross-origin and non-JSON requests before reading reviews or configuring a provider", async () => {
  const crossOrigin = new Request("https://campus.example/api/electives/analysis", { method: "POST", headers: { origin: "https://other.example", "content-type": "application/json" }, body: JSON.stringify({ course_id: sample.reviews[0].course_id }) });
  expect((await analysisPOST(crossOrigin)).status).toBe(403);
  const text = new Request("https://campus.example/api/electives/analysis", { method: "POST", headers: { origin: "https://campus.example", "content-type": "text/plain" }, body: "invalid" });
  expect((await analysisPOST(text)).status).toBe(415);
  expect(m.evidence).not.toHaveBeenCalled();
  expect(m.provider).not.toHaveBeenCalled();
});
it.each(["fabricated citation", "judge failure"])("keeps source evidence and omits partial analysis after %s", async failure => {
  m.evidence.mockResolvedValue(sample);
  const provider = failure === "fabricated citation"
    ? vi.fn().mockResolvedValue({ ...stage, claims: [{ ...stage.claims[0], review_id: "private-review" }] })
    : vi.fn().mockResolvedValueOnce(stage).mockResolvedValueOnce(stage).mockRejectedValueOnce(new Error("private provider details"));
  m.provider.mockReturnValue(provider);
  const response = await analysisPOST(request({ course_id: sample.reviews[0].course_id }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toEqual({ sample, analysis: { status: "unavailable", reason: "provider_failure" } });
  expect(JSON.stringify(body)).not.toContain("private");
  expect(provider).toHaveBeenCalledTimes(failure === "fabricated citation" ? 1 : 3);
});
