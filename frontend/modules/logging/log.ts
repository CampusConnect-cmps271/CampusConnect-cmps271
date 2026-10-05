import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redact, redactMessage } from "./redact";
import type { LogLevel } from "./schema";

export type LogSource = "server" | "client";

export type LogEntry = {
  level: LogLevel;
  source: LogSource;
  event: string;
  message: string | null;
  user_id: string | null;
  context: Record<string, unknown>;
};

export type LogOptions = {
  message?: string;
  userId?: string | null;
  source?: LogSource;
};

/**
 * Builds the row. Redaction happens here, so there is no path that writes an
 * entry without it.
 */
export function buildEntry(
  level: LogLevel,
  event: string,
  context?: Record<string, unknown>,
  options: LogOptions = {},
): LogEntry {
  return {
    level,
    source: options.source ?? "server",
    event,
    message: redactMessage(options.message),
    user_id: options.userId ?? null,
    context: redact(context),
  };
}

/** Writes the row, reporting its own failure rather than throwing. */
export async function persistEntry(entry: LogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("app_logs").insert(entry);

    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "logging.write.failure",
          message: error.message,
          original_event: entry.event,
        }),
      );
    }
  } catch (cause) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "logging.write.failure",
        message: cause instanceof Error ? cause.message : String(cause),
        original_event: entry.event,
      }),
    );
  }
}

/**
 * Prints one JSON line and schedules the database write.
 *
 * The write goes through `after()` so it never delays the response, and runs
 * even when the handler ends in a redirect or a thrown error. `after()` needs
 * a request scope, so outside one — instrumentation's register(), for example
 * — it falls back to writing directly.
 *
 * Returns a promise so a caller that needs the row persisted before the
 * process moves on, such as instrumentation, can await it. Everything else
 * can ignore it.
 */
function emit(
  level: LogLevel,
  event: string,
  context?: Record<string, unknown>,
  options?: LogOptions,
): Promise<void> {
  const entry = buildEntry(level, event, context, options);

  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));

  try {
    after(() => persistEntry(entry));
    return Promise.resolve();
  } catch {
    return persistEntry(entry);
  }
}

export const log = {
  info: (event: string, context?: Record<string, unknown>, options?: LogOptions) =>
    emit("info", event, context, options),
  warn: (event: string, context?: Record<string, unknown>, options?: LogOptions) =>
    emit("warn", event, context, options),
  error: (event: string, context?: Record<string, unknown>, options?: LogOptions) =>
    emit("error", event, context, options),
};
