import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/modules/logging/log", () => ({ log: { warn: vi.fn().mockResolvedValue(undefined) } }));
import { databaseTimings, emptyDatabaseTimings, trackedDatabaseFetch, threshold } from "./tracking";
import { log } from "@/modules/logging/log";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("database HTTP tracking", () => {
  it("isolates concurrent scopes and preserves bodies, cookies and options", async () => {
    const response = new Response("unchanged", { headers: { "set-cookie": "a=b" } });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => { await new Promise(r => setTimeout(r, 5)); return response; });
    const tracked = trackedDatabaseFetch("https://project.example", fetcher);
    const a = emptyDatabaseTimings(), b = emptyDatabaseTimings();
    const options = { method: "POST", body: "secret interests", headers: { authorization: "secret" } };
    const [result] = await Promise.all([
      databaseTimings.run(a, () => tracked("https://project.example/rest/v1/rpc/elective_candidate_page?student_id=private", options)),
      databaseTimings.run(b, async () => { await tracked("https://project.example/rest/v1/courses"); await tracked("https://project.example/rest/v1/profiles"); }),
    ]);
    expect(a.calls).toBe(1); expect(b.calls).toBe(2); expect(databaseTimings.getStore()).toBeUndefined();
    expect(result).toBe(response); expect(await result.text()).toBe("unchanged"); expect(result.headers.get("set-cookie")).toBe("a=b");
    expect(fetcher).toHaveBeenCalledWith("https://project.example/rest/v1/rpc/elective_candidate_page?student_id=private", options);
    expect(JSON.stringify(a)).not.toMatch(/secret|private/);
  });
  it("bounds failures, rethrows original errors and adds no retries", async () => {
    const failure = new Error("secret detail"), fetcher = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const tracked = trackedDatabaseFetch("https://project.example", fetcher), state = emptyDatabaseTimings();
    await databaseTimings.run(state, async () => { for (let i = 0; i < 9; i++) await expect(tracked("https://project.example/rest/v1/courses?filter=secret")).rejects.toBe(failure); });
    expect(fetcher).toHaveBeenCalledTimes(9); expect(state.calls).toBe(9); expect(state.failures).toBe(9); expect(state.slow_queries).toHaveLength(5);
    expect(JSON.stringify(state)).not.toContain("secret"); expect(state.slow_queries[0].operation).toBe("courses");
  });
  it("ignores auth, foreign origins and non-resource paths", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    const tracked = trackedDatabaseFetch("https://project.example", fetcher), state = emptyDatabaseTimings();
    await databaseTimings.run(state, async () => { await tracked("https://project.example/auth/v1/user"); await tracked("https://elsewhere.example/rest/v1/courses"); await tracked("https://project.example/rest/v1/courses/private"); });
    expect(state.calls).toBe(0); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("flags slow operations", async () => {
    vi.stubEnv("PERFORMANCE_SLOW_DATABASE_MS", "1");
    const tracked = trackedDatabaseFetch("https://project.example", async () => { await new Promise(r => setTimeout(r, 10)); return new Response("[]"); });
    const state = emptyDatabaseTimings(); await databaseTimings.run(state, () => tracked("https://project.example/rest/v1/courses"));
    expect(state.slow_count).toBe(1); expect(state.slow_queries).toHaveLength(1);
  });
  it("survives logging failure outside handlers", async () => {
    vi.mocked(log.warn).mockImplementationOnce(() => { throw new Error("unavailable"); });
    const tracked = trackedDatabaseFetch("https://project.example", async () => new Response("error", { status: 503 }));
    expect((await tracked("https://project.example/rest/v1/courses")).status).toBe(503);
  });
  it("supports opt-out and validates thresholds", async () => {
    vi.stubEnv("PERFORMANCE_TRACKING_ENABLED", "false"); vi.stubEnv("PERFORMANCE_SLOW_DATABASE_MS", "NaN");
    const state = emptyDatabaseTimings(), tracked = trackedDatabaseFetch("https://project.example", async () => new Response("ok"));
    await databaseTimings.run(state, () => tracked("https://project.example/rest/v1/courses")); expect(state.calls).toBe(0);
    expect(threshold("PERFORMANCE_SLOW_DATABASE_MS", 300)).toBe(300);
  });
});
