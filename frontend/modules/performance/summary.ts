export type MetricRow = { event: string; context: Record<string, unknown> | null };
export type EndpointSummary = { endpoint: string; method: string; count: number; errors: number; slow: number; p50: number; p95: number; max: number; databaseCalls: number; databaseMs: number };
export type QuerySummary = { operation: string; method: string; count: number; failures: number; max: number };
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const method = (value: unknown): value is string => typeof value === "string" && /^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|OTHER)$/.test(value);
export function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  return [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)];
}
export function summarizePerformance(rows: MetricRow[]) {
  const endpoints = new Map<string, EndpointSummary & { durations: number[] }>();
  const queries = new Map<string, QuerySummary>();
  function query(value: unknown) {
    if (!value || typeof value !== "object") return;
    const t = value as Record<string, unknown>;
    if (typeof t.operation !== "string" || !/^(rpc\/)?[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(t.operation) || !method(t.method) || !numeric(t.duration_ms) || !numeric(t.status)) return;
    const key = `${t.method} ${t.operation}`;
    const item = queries.get(key) ?? { operation: t.operation, method: t.method, count: 0, failures: 0, max: 0 };
    item.count++; item.failures += Number(t.status === 0 || t.status >= 400); item.max = Math.max(item.max, t.duration_ms);
    queries.set(key, item);
  }
  for (const row of rows) {
    const c = row.context ?? {};
    if (row.event === "database.request.slow_or_failed") { query(c); continue; }
    if (row.event !== "api.request.completed" || typeof c.endpoint !== "string" || !/^\/api\/[a-zA-Z0-9_/-]+$/.test(c.endpoint) || !method(c.method) || !numeric(c.duration_ms) || !numeric(c.status)) continue;
    const key = `${c.method} ${c.endpoint}`;
    const item = endpoints.get(key) ?? { endpoint: c.endpoint, method: c.method, count: 0, errors: 0, slow: 0, p50: 0, p95: 0, max: 0, databaseCalls: 0, databaseMs: 0, durations: [] };
    item.count++; item.errors += Number(c.status >= 400); item.slow += Number(c.slow === true); item.durations.push(c.duration_ms);
    const db = c.database as Record<string, unknown> | undefined;
    if (db && typeof db === "object") {
      if (numeric(db.calls)) item.databaseCalls += db.calls;
      if (numeric(db.duration_ms)) item.databaseMs += db.duration_ms;
      if (Array.isArray(db.slow_queries)) db.slow_queries.slice(0, 5).forEach(query);
    }
    endpoints.set(key, item);
  }
  return {
    endpoints: [...endpoints.values()].map(({ durations, ...item }) => ({ ...item, p50: percentile(durations, .5), p95: percentile(durations, .95), max: Math.max(...durations) })).sort((a, b) => b.p95 - a.p95),
    queries: [...queries.values()].sort((a, b) => b.max - a.max),
  };
}
