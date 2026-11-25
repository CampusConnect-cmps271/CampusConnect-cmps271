import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySyntheticStatus, runSyntheticChecks } from "../scripts/lib/synthetic-check.mjs";

describe("Sprint 5 reliability synthetic checks", () => {
  it("keeps 4xx and 429 separate from outages", () => {
    assert.equal(classifySyntheticStatus(404), "client_error");
    assert.equal(classifySyntheticStatus(429), "rate_limited");
    assert.equal(classifySyntheticStatus(500), "server_error");
  });

  it("records representative journeys without exposing the authentication cookie", async () => {
    const statuses = [200, 200, 429, 404, 503];
    const requests = [];
    const report = await runSyntheticChecks({
      baseUrl: "https://staging.example.test",
      cookie: "private-session=value",
      fetchImpl: async (url, init) => {
        requests.push({ url: url.toString(), cookie: init.headers.cookie });
        return new Response(null, { status: statuses.shift() });
      },
      now: () => new Date("2026-11-24T10:00:00.000Z"),
    });

    assert.deepEqual(report.summary, {
      checks: 5,
      available: 2,
      client_errors: 1,
      rate_limited: 1,
      authentication_failures: 0,
      outages: 1,
      passed: false,
    });
    assert.equal(JSON.stringify(report).includes("private-session"), false);
    assert.equal(requests.length, 5);
  });

  it("skips authenticated journeys explicitly when no test session is configured", async () => {
    const report = await runSyntheticChecks({
      baseUrl: "https://staging.example.test",
      fetchImpl: async () => new Response(null, { status: 200 }),
    });
    assert.equal(report.summary.checks, 1);
    assert.equal(report.results.filter((result) => result.outcome === "skipped").length, 4);
  });
});
