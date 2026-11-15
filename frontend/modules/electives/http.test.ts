import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), courses: vi.fn(), validate: vi.fn(), profile: vi.fn(), semester: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ getCurrentUser: m.user }));
vi.mock("@/modules/logging", () => ({ log: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/modules/profiles", () => ({ getProfile: m.profile }));
vi.mock("./preferences", () => ({ validateCompletedCourses: m.validate, validateOfferingSemester: m.semester }));
vi.mock("./catalogue", () => ({ loadCandidatesForUser: m.courses }));
import { recommendationsPOST, sameOrigin } from "./http";
const preferences = { interests: ["robotics"], preferred_workload: "light", academic_goals: "Learn design", completed_course_codes: [] };
const request = (body: unknown = preferences, origin = "https://campus.example") => new Request("https://campus.example/api/electives/recommendations", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ id: "owner" }); m.validate.mockResolvedValue([]); m.semester.mockResolvedValue(true); m.courses.mockResolvedValue({ courses: [], truncated: false }); m.profile.mockResolvedValue({ major: "Computer Science" }); });
it("requires authentication and same-origin JSON", async () => {
  m.user.mockResolvedValue(null); expect((await recommendationsPOST(request())).status).toBe(401);
  m.user.mockResolvedValue({ id: "owner" }); expect((await recommendationsPOST(request(preferences, "https://evil.example"))).status).toBe(403);
  expect(m.courses).not.toHaveBeenCalled();
  expect(m.profile).not.toHaveBeenCalled();
});
it("uses the public Host when Next's internal URL differs", () => {
  expect(sameOrigin(new Request("http://localhost:3100/api/electives/recommendations", { headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" } }))).toBe(true);
});
it("rejects malformed, large and unknown-code input", async () => {
  expect((await recommendationsPOST(request({}))).status).toBe(400);
  expect((await recommendationsPOST(request("x".repeat(17000)))).status).toBe(400);
  m.validate.mockResolvedValue(["FAKE 999"]); expect((await recommendationsPOST(request())).status).toBe(400);
});
it("returns private noncached results and generic data errors", async () => {
  const result = await recommendationsPOST(request()); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toContain("no-store");
  expect(m.courses).toHaveBeenCalledWith(preferences, { id: "owner" });
  m.courses.mockRejectedValue(new Error("private SQL details"));
  const failed = await recommendationsPOST(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("SQL");
});
it("uses the authenticated profile's major and never accepts a forged major", async () => {
  const valid = await recommendationsPOST(request());
  expect(await valid.json()).toMatchObject({ studentMajor: "Computer Science", majorStatus: "known" });
  expect((await recommendationsPOST(request({ ...preferences, major: "Engineering" }))).status).toBe(400);
});
it("keeps recommendations available with honest missing/unavailable major notices", async () => {
  m.profile.mockResolvedValue({ major: null });
  expect(await (await recommendationsPOST(request())).json()).toMatchObject({ studentMajor: null, majorStatus: "missing" });
  m.profile.mockRejectedValue(new Error("private profile failure"));
  const response = await recommendationsPOST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ studentMajor: null, majorStatus: "unavailable" });
});

it("rejects an unavailable offering semester before querying candidates", async () => {
  m.semester.mockResolvedValue(false);
  const response = await recommendationsPOST(request({ ...preferences, offering_preferences: { semester_id: "202720" } }));
  expect(response.status).toBe(400);
  expect(m.courses).not.toHaveBeenCalled();
});

it("exposes bounded stage timings without student preferences or identifiers", async()=>{
  m.courses.mockResolvedValue({courses:[],truncated:false,catalogueCount:3380,diagnostics:{cache:"hit",dbRequests:0,responseBytes:0,queryMs:0}});
  const response=await recommendationsPOST(request());
  expect(response.headers.get("server-timing")).toMatch(/auth;dur=[0-9.]+/);
  expect(response.headers.get("server-timing")).toContain('catalogue_cache;desc="hit"');
  expect(response.headers.get("server-timing")).not.toContain("owner");
  expect(response.headers.get("server-timing")).toContain("ranking;dur=");
  expect(response.headers.get("server-timing")).toContain("provider;dur=0.0");
  expect(m.profile).toHaveBeenCalledWith("owner");
  expect(await response.json()).toMatchObject({catalogueCount:3380});
});
