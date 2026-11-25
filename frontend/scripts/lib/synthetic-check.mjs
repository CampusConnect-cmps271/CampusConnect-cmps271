const DEFAULT_TIMEOUT_MS = 8_000;

export const JOURNEYS = [
  { name: "Login reachability", path: "/login", authenticated: false },
  { name: "Feed", path: "/home", authenticated: true },
  { name: "Events", path: "/events", authenticated: true },
  { name: "Courses", path: "/courses", authenticated: true },
  { name: "Communities", path: "/communities", authenticated: true },
];

export function classifySyntheticStatus(status) {
  if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error("Invalid HTTP status");
  if (status >= 500) return "server_error";
  if (status === 429) return "rate_limited";
  if (status >= 400) return "client_error";
  return "available";
}

export async function runSyntheticChecks({
  baseUrl,
  cookie = "",
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
} = {}) {
  const origin = new URL(baseUrl);
  const results = [];
  for (const journey of JOURNEYS) {
    if (journey.authenticated && !cookie) {
      results.push({ ...journey, outcome: "skipped", status: null, latency_ms: null, checked_at: now().toISOString(), detail: "SYNTHETIC_COOKIE not configured" });
      continue;
    }
    const started = performance.now();
    try {
      const response = await fetchImpl(new URL(journey.path, origin), {
        method: "GET",
        headers: cookie ? { cookie } : undefined,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      let outcome = classifySyntheticStatus(response.status);
      if (journey.authenticated && response.status >= 300 && response.status < 400) outcome = "auth_failure";
      results.push({ ...journey, outcome, status: response.status, latency_ms: Math.round(performance.now() - started), checked_at: now().toISOString() });
    } catch (error) {
      results.push({ ...journey, outcome: "timeout_or_network", status: null, latency_ms: Math.round(performance.now() - started), checked_at: now().toISOString(), detail: error instanceof Error ? error.name : "request failed" });
    }
  }

  const counted = results.filter((result) => result.outcome !== "skipped");
  const outages = counted.filter((result) => result.outcome === "server_error" || result.outcome === "timeout_or_network");
  return {
    version: 1,
    target_origin: origin.origin,
    checked_at: now().toISOString(),
    summary: {
      checks: counted.length,
      available: counted.filter((result) => result.outcome === "available").length,
      client_errors: counted.filter((result) => result.outcome === "client_error").length,
      rate_limited: counted.filter((result) => result.outcome === "rate_limited").length,
      authentication_failures: counted.filter((result) => result.outcome === "auth_failure").length,
      outages: outages.length,
      passed: outages.length === 0,
    },
    results,
  };
}
