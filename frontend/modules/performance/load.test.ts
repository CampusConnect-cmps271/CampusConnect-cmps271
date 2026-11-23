import { afterEach, expect, it, vi } from "vitest";
// The harness is also runnable directly with node; it deliberately has no service dependencies.
import { runLoad } from "../../scripts/load-test.mjs";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("refuses remote targets, missing sessions and unsafe concurrency", async () => {
  await expect(runLoad({ baseURL: "https://campus-connect-cmps271.vercel.app", cookie: "test" })).rejects.toThrow("loopback");
  await expect(runLoad({ baseURL: "http://127.0.0.1:3200", cookie: "" })).rejects.toThrow("session");
  await expect(runLoad({ baseURL: "http://127.0.0.1:3200", cookie: "test", concurrencies: [500] })).rejects.toThrow("bounded");
});
it("checks authenticated response content and full request counts at each load level", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "table").mockImplementation(() => {});
  const fetcher = vi.fn(async () => Response.json({ items: [], count: 0, recommendations: [{ code: "HIST 200" }] }));
  vi.stubGlobal("fetch", fetcher);
  const result = await runLoad({ baseURL: "http://127.0.0.1:3200", cookie: "test", requests: 9, concurrencies: [1, 3] });
  expect(result.passed).toBe(true); expect(fetcher).toHaveBeenCalledTimes(21); expect(result.results).toHaveLength(6);
  expect(result.results.every((r: { requests: number }) => r.requests === 3)).toBe(true);
});
it("fails warmup instead of benchmarking a fast signed-out error", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ error: "Sign in" }, { status: 401 }));
  await expect(runLoad({ baseURL: "http://127.0.0.1:3200", cookie: "test" })).rejects.toThrow("Warmup failed");
});
