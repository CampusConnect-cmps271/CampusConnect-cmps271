import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { LogEntry } from "@/modules/logging/log";
import {
  alertForLogEntry,
  alertsForHealthSnapshot,
  createAlertDispatcher,
  deliverAlert,
  type MonitoringAlert,
} from "./alerts";

const seriousEntry: LogEntry = {
  level: "error",
  source: "server",
  event: "backend.error.unexpected",
  message: "Unexpected failure",
  user_id: null,
  context: { route: "/courses", token: "[redacted]" },
};

const alert: MonitoringAlert = {
  key: "health:database:outage",
  severity: "critical",
  event: "health.database.outage",
  title: "Database health check outage",
  occurredAt: "2026-11-09T12:00:00.000Z",
  details: { service: "database" },
};

describe("monitoring alert rules", () => {
  it("alerts only for serious application errors", () => {
    expect(alertForLogEntry(seriousEntry)).toMatchObject({
      key: "log:backend.error.unexpected",
      severity: "critical",
    });
    expect(alertForLogEntry({ ...seriousEntry, event: "courses.catalogue.read_failure" })).toBeNull();
    expect(alertForLogEntry({ ...seriousEntry, level: "warn" })).toBeNull();
  });

  it("creates warning and critical alerts for failed health checks", () => {
    const alerts = alertsForHealthSnapshot({
      overall: "unhealthy",
      checkedAt: "2026-11-09T12:00:00.000Z",
      checks: [
        { service: "website", label: "Website", status: "operational", message: "ok", latencyMs: 1 },
        { service: "database", label: "Database", status: "outage", message: "down", latencyMs: 5 },
        { service: "ai", label: "AI services", status: "degraded", message: "slow", latencyMs: 8 },
      ],
    });

    expect(alerts.map(({ key, severity }) => ({ key, severity }))).toEqual([
      { key: "health:database:outage", severity: "critical" },
      { key: "health:ai:degraded", severity: "warning" },
    ]);
  });
});

describe("alert delivery", () => {
  it("sends a bounded webhook request with optional bearer authentication", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      deliverAlert(
        alert,
        {
          MONITORING_ALERT_WEBHOOK_URL: "https://alerts.example.test/hooks/campus",
          MONITORING_ALERT_WEBHOOK_TOKEN: "test-token",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({ status: "delivered" });

    const [, init] = fetchImpl.mock.calls[0];
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token",
      },
      cache: "no-store",
      redirect: "error",
    });
    expect(init.body).not.toContain("test-token");
  });

  it("refuses missing or unsafe webhook configuration", async () => {
    const fetchImpl = vi.fn();
    await expect(deliverAlert(alert, {}, fetchImpl)).resolves.toEqual({ status: "not_configured" });
    await expect(
      deliverAlert(alert, { MONITORING_ALERT_WEBHOOK_URL: "http://alerts.example.test" }, fetchImpl),
    ).resolves.toEqual({ status: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("suppresses duplicate delivered alerts during the cooldown", async () => {
    let now = 1_000;
    const deliver = vi.fn().mockResolvedValue({ status: "delivered" as const });
    const dispatch = createAlertDispatcher({ cooldownMs: 500, now: () => now, deliver });

    await expect(dispatch(alert)).resolves.toEqual({ status: "delivered" });
    now += 100;
    await expect(dispatch(alert)).resolves.toEqual({ status: "suppressed" });
    now += 500;
    await expect(dispatch(alert)).resolves.toEqual({ status: "delivered" });
    expect(deliver).toHaveBeenCalledTimes(2);
  });
});
