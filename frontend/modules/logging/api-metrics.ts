
import "server-only";

import { log } from "./log";

type ApiHandler<Args extends unknown[]> = (
  ...args: Args
) => Promise<Response>;

export function trackApiRequest<Args extends unknown[]>(
  endpoint: string,
  method: string,
  handler: ApiHandler<Args>,
): ApiHandler<Args> {
  return async (...args: Args): Promise<Response> => {
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
        }).catch((error: unknown) => {
          console.error("API metric logging failed:", error);
        });
      } catch (error) {
        console.error("API metric logging failed:", error);
      }
    }
  };
}
