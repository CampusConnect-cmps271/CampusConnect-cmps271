/**
 * Public API of the logging module (server side).
 *
 * This entry is server-only. A Client Component must import
 * "@/modules/logging/client" instead, which posts to /api/log.
 */

export { buildEntry, log, persistEntry } from "./log";
export type { LogEntry, LogOptions, LogSource } from "./log";

export {
  isSensitiveKey,
  maskEmails,
  redact,
  redactMessage,
  REDACTED,
} from "./redact";

export {
  clientLogSchema,
  EVENT_NAME_PATTERN,
  LOG_LEVELS,
  MAX_CONTEXT_ENTRIES,
  MAX_LOG_BODY_BYTES,
  type ClientLogInput,
  type LogLevel,
} from "./schema";

export {
  accountIdFromHeaders,
  clientErrorContext,
  describeError,
  pathnameOnly,
  type ErrorDetails,
} from "./error-details";

export {
  groupErrorLogs,
  type ErrorGroup,
  type ErrorLogRow,
} from "./dashboard";

export { loadRecentErrors } from "./dashboard-server";
