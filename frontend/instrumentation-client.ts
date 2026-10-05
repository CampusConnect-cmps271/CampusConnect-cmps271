import { reportClientError } from "@/modules/logging/client";

try {
  window.addEventListener("error", (event) => {
    reportClientError(
      "frontend.error.uncaught",
      event.error ?? new Error(event.message || "Unknown browser error"),
      {
        filename: event.filename || undefined,
        line: event.lineno || undefined,
        column: event.colno || undefined,
      },
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError("frontend.error.unhandled_rejection", event.reason);
  });
} catch {
  // Monitoring setup must never prevent the application from hydrating.
}
