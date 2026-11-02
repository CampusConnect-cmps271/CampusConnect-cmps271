import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { boundedJson, configuredProvider } from "./provider";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("bounds JSON reads for both incoming and provider bodies", async () => {
  await expect(boundedJson(new Response('"' + "x".repeat(40) + '"'), 32)).rejects.toThrow("limit");
  await expect(boundedJson(new Response("not json"))).rejects.toThrow();
});
it("keeps credentials server-side and enforces timeout, HTTPS and no redirects", async () => {
  vi.stubEnv("ELECTIVES_PROVIDER_URL", "http://insecure.example"); vi.stubEnv("ELECTIVES_PROVIDER_TOKEN", "test-secret");
  expect(configuredProvider()).toBeUndefined();
  vi.stubEnv("ELECTIVES_PROVIDER_URL", "https://provider.example/api");
  const fetch = vi.fn().mockResolvedValue(new Response('{"items":[]}')); vi.stubGlobal("fetch", fetch);
  await configuredProvider()!("recommend", { candidates: [] });
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store", headers: { authorization: "Bearer test-secret" } });
  expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  fetch.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
  await expect(configuredProvider()!("recommend", {})).rejects.toThrow("Timed out");
});
