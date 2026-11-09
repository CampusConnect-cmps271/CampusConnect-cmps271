import { afterEach, describe, expect, it, vi } from "vitest";

const { notifyHealthAlerts, runHealthChecks } = vi.hoisted(() => ({
  notifyHealthAlerts: vi.fn(),
  runHealthChecks: vi.fn(),
}));

vi.mock("@/modules/monitoring", () => ({
  notifyHealthAlerts,
  runHealthChecks,
}));

import { GET } from "@/app/api/cron/health/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("scheduled health checks", () => {
  it("rejects requests when the cron secret is absent or incorrect", async () => {
    const missing = await GET(new Request("https://campus.example/api/cron/health"));
    expect(missing.status).toBe(401);

    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const incorrect = await GET(new Request("https://campus.example/api/cron/health", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(incorrect.status).toBe(401);
    expect(runHealthChecks).not.toHaveBeenCalled();
  });

  it("runs checks and delivers alerts for an authorized Vercel cron request", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const snapshot = {
      overall: "unhealthy",
      checkedAt: "2026-11-09T12:00:00.000Z",
      checks: [],
    };
    runHealthChecks.mockResolvedValue(snapshot);
    notifyHealthAlerts.mockResolvedValue([
      { status: "delivered" },
      { status: "suppressed" },
    ]);

    const response = await GET(new Request("https://campus.example/api/cron/health", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ...snapshot,
      alerts: ["delivered", "suppressed"],
    });
    expect(notifyHealthAlerts).toHaveBeenCalledWith(snapshot);
  });
});
