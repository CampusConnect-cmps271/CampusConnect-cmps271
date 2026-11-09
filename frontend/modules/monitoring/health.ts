import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ComponentHealth,
  HealthCheck,
  HealthSnapshot,
  OverallHealth,
} from "./types";

const AI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_AI_MODEL = "gemini-3.1-flash-lite";
const PROBE_TIMEOUT_MS = 5_000;

type ProbeResult = {
  status?: Exclude<ComponentHealth, "outage">;
  message: string;
};

type HealthDependencies = {
  databaseProbe?: () => Promise<ProbeResult>;
  aiProbe?: () => Promise<ProbeResult>;
  now?: () => Date;
  monotonicNow?: () => number;
};

async function databaseProbe(): Promise<ProbeResult> {
  const { error } = await createAdminClient()
    .from("app_logs")
    .select("id")
    .limit(1);

  if (error) throw new Error("database probe failed");
  return { message: "Supabase database is reachable." };
}

async function aiProbe(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "degraded",
      message: "Gemini is not configured in this environment.",
    };
  }

  const model = (
    env.CAMPUS_ASSISTANT_MODEL?.trim() ||
    env.GEMINI_MODEL?.trim() ||
    DEFAULT_AI_MODEL
  );

  if (!/^gemini-[A-Za-z0-9._-]+$/.test(model)) {
    throw new Error("invalid AI model configuration");
  }

  const response = await fetchImpl(
    `${AI_ENDPOINT}/${encodeURIComponent(model)}`,
    {
      headers: { "x-goog-api-key": apiKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    },
  );

  if (!response.ok) throw new Error("AI provider probe failed");
  return { message: "Gemini model endpoint is reachable." };
}

async function measuredCheck(
  service: HealthCheck["service"],
  label: string,
  probe: () => Promise<ProbeResult>,
  monotonicNow: () => number,
): Promise<HealthCheck> {
  const startedAt = monotonicNow();

  try {
    const result = await probe();
    return {
      service,
      label,
      status: result.status ?? "operational",
      message: result.message,
      latencyMs: Math.max(0, Math.round(monotonicNow() - startedAt)),
    };
  } catch {
    return {
      service,
      label,
      status: "outage",
      message: `${label} is unavailable.`,
      latencyMs: Math.max(0, Math.round(monotonicNow() - startedAt)),
    };
  }
}

function overallStatus(checks: readonly HealthCheck[]): OverallHealth {
  if (checks.some((check) => check.status === "outage")) return "unhealthy";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "healthy";
}

export async function runHealthChecks(
  dependencies: HealthDependencies = {},
): Promise<HealthSnapshot> {
  const now = dependencies.now ?? (() => new Date());
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const [database, ai] = await Promise.all([
    measuredCheck(
      "database",
      "Database",
      dependencies.databaseProbe ?? databaseProbe,
      monotonicNow,
    ),
    measuredCheck(
      "ai",
      "AI services",
      dependencies.aiProbe ?? (() => aiProbe()),
      monotonicNow,
    ),
  ]);

  const checks: HealthCheck[] = [
    {
      service: "website",
      label: "Website",
      status: "operational",
      message: "The CampusConnect application is responding.",
      latencyMs: 0,
    },
    database,
    ai,
  ];

  return {
    overall: overallStatus(checks),
    checkedAt: now().toISOString(),
    checks,
  };
}

export { aiProbe, overallStatus };
