import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { log } from "@/modules/logging/log";

export type DatabaseTiming = { operation: string; method: string; status: number; duration_ms: number };
export type RequestDatabaseTimings = { calls: number; duration_ms: number; max_ms: number; failures: number; slow_count: number; slow_queries: DatabaseTiming[] };
export const databaseTimings = new AsyncLocalStorage<RequestDatabaseTimings>();
export const emptyDatabaseTimings = (): RequestDatabaseTimings => ({ calls: 0, duration_ms: 0, max_ms: 0, failures: 0, slow_count: 0, slow_queries: [] });
export const roundMs = (value: number) => Math.round(Math.max(0, value) * 100) / 100;
export function threshold(name: string, fallback: number) {
  const raw = process.env[name];
  const value = raw?.trim() ? Number(raw) : NaN;
  return Number.isFinite(value) && value >= 1 && value <= 60_000 ? value : fallback;
}

// Outside API handlers record only anomalies, with a per-process minute cap.
let windowStart = 0, emitted = 0;
function emitDatabaseAnomaly(timing: DatabaseTiming) {
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; emitted = 0; }
  if (emitted++ >= 30) return;
  try {
    void log.warn("database.request.slow_or_failed", timing).catch(() => {});
  } catch { /* Monitoring must never change database behavior. */ }
}

/** Measures HTTP attempts to PostgREST until response headers, not SQL execution.
 * Only resource identifiers are recorded: never filters, SQL, bodies or tokens.
 * Admin/logging clients deliberately do not use this wrapper (avoids recursion).
 */
export function trackedDatabaseFetch(projectUrl: string, fetcher: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const origin = new URL(projectUrl).origin;
  return async (input, init) => {
    let operation: string | undefined;
    try {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const match = url.pathname.match(/^\/rest\/v1\/(?:rpc\/)?[a-zA-Z_][a-zA-Z0-9_]{0,62}$/);
      if (url.origin === origin && match) operation = match[0].slice("/rest/v1/".length);
    } catch { /* Native fetch retains responsibility for invalid inputs. */ }
    if (!operation || process.env.PERFORMANCE_TRACKING_ENABLED === "false") return fetcher(input, init);
    const verb = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const method = ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"].includes(verb) ? verb : "OTHER";
    const started = performance.now();
    let status = 0;
    try {
      const response = await fetcher(input, init);
      status = response.status;
      return response;
    } finally {
      const duration_ms = roundMs(performance.now() - started);
      const timing = { operation, method, status, duration_ms };
      const slow = duration_ms >= threshold("PERFORMANCE_SLOW_DATABASE_MS", 300);
      const failed = status === 0 || status >= 400;
      const context = databaseTimings.getStore();
      if (context) {
        context.calls++;
        context.duration_ms = roundMs(context.duration_ms + duration_ms);
        context.max_ms = Math.max(context.max_ms, duration_ms);
        if (failed) context.failures++;
        if (slow) context.slow_count++;
        if (slow || failed) {
          context.slow_queries.push(timing);
          context.slow_queries.sort((a, b) => b.duration_ms - a.duration_ms);
          context.slow_queries.length = Math.min(context.slow_queries.length, 5);
        }
      } else if (slow || failed) emitDatabaseAnomaly(timing);
    }
  };
}
