import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { aiProbe, overallStatus, runHealthChecks } from "./health";

describe("runHealthChecks", () => {
  it("reports a healthy system when every dependency responds", async () => {
    const snapshot = await runHealthChecks({
      databaseProbe: async () => ({ message: "Database ready." }),
      aiProbe: async () => ({ message: "AI ready." }),
      now: () => new Date("2026-11-09T12:00:00.000Z"),
      monotonicNow: (() => {
        let value = 0;
        return () => (value += 5);
      })(),
    });

    expect(snapshot.overall).toBe("healthy");
    expect(snapshot.checkedAt).toBe("2026-11-09T12:00:00.000Z");
    expect(snapshot.checks.map((check) => check.status)).toEqual([
      "operational",
      "operational",
      "operational",
    ]);
  });

  it("isolates failed probes and makes the overall status unhealthy", async () => {
    const snapshot = await runHealthChecks({
      databaseProbe: async () => {
        throw new Error("private database detail");
      },
      aiProbe: async () => ({ status: "degraded", message: "AI is not configured." }),
    });

    expect(snapshot.overall).toBe("unhealthy");
    expect(snapshot.checks.find((check) => check.service === "database")).toMatchObject({
      status: "outage",
      message: "Database is unavailable.",
    });
    expect(JSON.stringify(snapshot)).not.toContain("private database detail");
  });

  it("derives degraded and unhealthy states from component checks", () => {
    const base = { label: "test", message: "test", latencyMs: 0 } as const;
    expect(overallStatus([{ ...base, service: "website", status: "operational" }])).toBe("healthy");
    expect(overallStatus([{ ...base, service: "ai", status: "degraded" }])).toBe("degraded");
    expect(overallStatus([{ ...base, service: "database", status: "outage" }])).toBe("unhealthy");
  });
});

describe("Gemini health probe", () => {
  it("reports a deliberate degraded state when Gemini is not configured", async () => {
    await expect(aiProbe({}, vi.fn())).resolves.toEqual({
      status: "degraded",
      message: "Gemini is not configured in this environment.",
    });
  });

  it("checks model metadata with the key in a header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await aiProbe(
      { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test-model" },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model",
      expect.objectContaining({
        headers: { "x-goog-api-key": "test-key" },
        cache: "no-store",
        redirect: "error",
      }),
    );
    expect(fetchImpl.mock.calls[0][0]).not.toContain("test-key");
  });
});
