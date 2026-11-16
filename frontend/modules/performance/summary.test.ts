import { expect, it } from "vitest";
import { summarizePerformance } from "./summary";
it("calculates percentiles and separates HTTP failures and database anomalies", () => {
  const rows = [10, 20, 30, 40, 1000].map((duration_ms, i) => ({ event: "api.request.completed", context: { endpoint: "/api/notifications", method: "GET", status: i === 4 ? 503 : 200, duration_ms, slow: i === 4, database: { calls: 2, duration_ms: 5, slow_queries: i === 4 ? [{ operation: "notifications", method: "GET", status: 503, duration_ms: 500 }] : [] } } }));
  const result = summarizePerformance(rows);
  expect(result.endpoints[0]).toMatchObject({ count: 5, errors: 1, slow: 1, p50: 30, p95: 1000, max: 1000, databaseCalls: 10, databaseMs: 25 });
  expect(result.queries[0]).toEqual({ operation: "notifications", method: "GET", count: 1, failures: 1, max: 500 });
});
it("handles legacy metrics, empty data and malformed telemetry", () => {
  expect(summarizePerformance([])).toEqual({ endpoints: [], queries: [] });
  const result = summarizePerformance([
    { event: "api.request.completed", context: { endpoint: "/api/notifications", method: "GET", status: 200, duration_ms: 20 } },
    { event: "api.request.completed", context: { endpoint: "/api/a?token=secret", method: "GET", status: 200, duration_ms: 1 } },
    { event: "api.request.completed", context: { endpoint: "/api/a", method: "GET", status: 200, duration_ms: NaN } },
    { event: "database.request.slow_or_failed", context: { operation: "rpc/elective_candidate_page", method: "POST", status: 0, duration_ms: 300 } },
    { event: "database.request.slow_or_failed", context: { operation: "courses?user_id=secret", method: "GET", status: 400, duration_ms: 1 } },
  ]);
  expect(result.endpoints).toHaveLength(1); expect(result.endpoints[0].databaseCalls).toBe(0); expect(result.queries).toHaveLength(1);
});
