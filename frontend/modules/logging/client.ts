import { redact } from "./redact";
import type { LogLevel } from "./schema";

/**
 * Browser-side logging. Posts to /api/log, which validates, redacts again and
 * stores the entry with source = 'client'.
 *
 * Import this from "@/modules/logging/client". The module's main entry is
 * server-only and would break a client bundle.
 *
 * Uses sendBeacon so the report survives the page being navigated away from or
 * closed, which is exactly when an error report matters. Falls back to fetch
 * with keepalive where sendBeacon is unavailable or refuses the payload.
 */
const ENDPOINT = "/api/log";

export type ClientLogOptions = {
  level?: LogLevel;
  message?: string;
};

export function logClient(
  event: string,
  context?: Record<string, unknown>,
  options: ClientLogOptions = {},
): void {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    event,
    level: options.level ?? "error",
    message: options.message,
    // Redacted here as well, so nothing sensitive leaves the browser at all.
    context: redact(context),
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      // Returns false when the payload is rejected, e.g. over the queue limit.
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }

    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Logging must never break the page it is reporting on.
    });
  } catch {
    // Same here: swallow it.
  }
}
