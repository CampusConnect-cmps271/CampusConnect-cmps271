
import "server-only";

import { log } from "./log";
import { databaseTimings, emptyDatabaseTimings, threshold } from "@/modules/performance/tracking";

type ApiHandler<Args extends unknown[]> = (
  ...args: Args
) => Promise<Response>;

export function trackApiRequest<Args extends unknown[]>(
  endpoint: string,
  method: string,
  handler: ApiHandler<Args>,
): ApiHandler<Args> {
  return async (...args: Args): Promise<Response> => databaseTimings.run(emptyDatabaseTimings(), async () => {
    const start = performance.now();
    let status = 500;

    try {
      const response = await handler(...args);
      status = response.status;
      return response;
    } finally {
      const durationMs = Math.max(
        0,
        Math.round((performance.now() - start) * 100) / 100,
      );

      const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

      try {
        void log[level]("api.request.completed", {
          endpoint,
          method,
          status,
          duration_ms: durationMs,
          slow: durationMs >= threshold("PERFORMANCE_SLOW_REQUEST_MS", 1000),
          database: databaseTimings.getStore(),
        }).catch((error: unknown) => {
          console.error("API metric logging failed:", error);
        });
      } catch (error) {
        console.error("API metric logging failed:", error);
      }
    }
  });
}
