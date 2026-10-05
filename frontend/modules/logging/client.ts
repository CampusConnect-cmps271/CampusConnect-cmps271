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

/**
 * True for the exceptions Next throws to steer navigation.
 *
 * `redirect()` and `notFound()` work by throwing, so a try/catch wrapped round
 * a Server Action sees them on the happy path. Logging those as failures would
 * report every successful login as an error.
 */
export function isFrameworkNavigation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

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

  try {
    // Inside the try: redact walks caller-supplied data, and a throwing getter
    // or an exotic object would otherwise throw straight into the caller —
    // which is a React effect at both call sites.
    const payload = JSON.stringify({
      event,
      level: options.level ?? "error",
      message: options.message,
      // Redacted here as well, so nothing sensitive leaves the browser at all.
      context: redact(context),
    });

    // The beacon gets its own guard: it can throw as well as return false, and
    // a throw must fall through to fetch rather than skip it.
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        const blob = new Blob([payload], { type: "application/json" });
        // False when the payload is rejected, e.g. over the queue limit.
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
    } catch {
      // Fall through to fetch.
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
