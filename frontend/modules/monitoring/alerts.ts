import "server-only";
import type { LogEntry } from "@/modules/logging/log";
import type { HealthSnapshot } from "./types";

const ALERT_TIMEOUT_MS = 5_000;
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1_000;
const SERIOUS_LOG_EVENTS = new Set([
  "app.start.missing_env",
  "backend.error.unexpected",
  "logging.write.failure",
]);

export type MonitoringAlert = {
  key: string;
  severity: "warning" | "critical";
  event: string;
  title: string;
  occurredAt: string;
  details: Record<string, unknown>;
};

export type AlertDelivery =
  | { status: "delivered" }
  | { status: "suppressed" }
  | { status: "not_configured" }
  | { status: "failed" };

type AlertEnvironment = {
  [key: string]: string | undefined;
  MONITORING_ALERT_WEBHOOK_URL?: string;
  MONITORING_ALERT_WEBHOOK_TOKEN?: string;
};

export function alertForLogEntry(
  entry: LogEntry,
  occurredAt = new Date().toISOString(),
): MonitoringAlert | null {
  if (entry.level !== "error" || !SERIOUS_LOG_EVENTS.has(entry.event)) {
    return null;
  }

  return {
    key: `log:${entry.event}`,
    severity: "critical",
    event: entry.event,
    title: "Serious CampusConnect error",
    occurredAt,
    details: {
      source: entry.source,
      message: entry.message,
      context: entry.context,
    },
  };
}

export function alertsForHealthSnapshot(
  snapshot: HealthSnapshot,
): MonitoringAlert[] {
  return snapshot.checks
    .filter((check) => check.status !== "operational")
    .map((check) => ({
      key: `health:${check.service}:${check.status}`,
      severity: check.status === "outage" ? "critical" : "warning",
      event: `health.${check.service}.${check.status}`,
      title: `${check.label} health check ${check.status}`,
      occurredAt: snapshot.checkedAt,
      details: {
        service: check.service,
        status: check.status,
        latency_ms: check.latencyMs,
        message: check.message,
      },
    }));
}

function webhookConfig(env: AlertEnvironment): {
  url: string;
  token: string | null;
} | null {
  const raw = env.MONITORING_ALERT_WEBHOOK_URL?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return {
      url: url.toString(),
      token: env.MONITORING_ALERT_WEBHOOK_TOKEN?.trim() || null,
    };
  } catch {
    return null;
  }
}

export async function deliverAlert(
  alert: MonitoringAlert,
  env: AlertEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<AlertDelivery> {
  const config = webhookConfig(env);
  if (!config) return { status: "not_configured" };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.token) headers.authorization = `Bearer ${config.token}`;

  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ version: 1, ...alert }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });

    return { status: response.ok ? "delivered" : "failed" };
  } catch {
    return { status: "failed" };
  }
}

export function createAlertDispatcher(
  options: {
    cooldownMs?: number;
    now?: () => number;
    deliver?: (alert: MonitoringAlert) => Promise<AlertDelivery>;
  } = {},
) {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  const deliver = options.deliver ?? ((alert) => deliverAlert(alert));
  const lastDelivered = new Map<string, number>();

  return async (alert: MonitoringAlert): Promise<AlertDelivery> => {
    const current = now();
    const previous = lastDelivered.get(alert.key);
    if (previous !== undefined && current - previous < cooldownMs) {
      return { status: "suppressed" };
    }

    const result = await deliver(alert);
    if (result.status === "delivered") lastDelivered.set(alert.key, current);
    return result;
  };
}

const dispatchAlert = createAlertDispatcher();

export async function notifyLogAlert(entry: LogEntry): Promise<AlertDelivery | null> {
  const alert = alertForLogEntry(entry);
  return alert ? dispatchAlert(alert) : null;
}

export async function notifyHealthAlerts(
  snapshot: HealthSnapshot,
): Promise<AlertDelivery[]> {
  return Promise.all(alertsForHealthSnapshot(snapshot).map(dispatchAlert));
}
