import "server-only";
import { after } from "next/server";
import { storeLogRow } from "./log-store";
import { notifyLogAlert } from "@/modules/monitoring";
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
 * Builds and redacts routine rows before they enter the persistence queue.
 * Course diagnostics separately construct their fixed whitelist of fields.
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
export async function persistEntry(entry: LogEntry, createdAt = new Date().toISOString()): Promise<void> {
  try {
    await storeLogRow({ ...entry, created_at: createdAt });
    // Alert delivery stays per entry, after successful persistence. It does
    // not hold the database batch writer open or merge alert decisions.
    await notifyLogAlert(entry);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message :
      typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string" ? cause.message : "Log persistence failed";
    console.error(JSON.stringify({
      level: "error", event: "logging.write.failure",
      message: redactMessage(message), original_event: entry.event,
    }));
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

  const emittedAt = new Date().toISOString();
  console.log(JSON.stringify({ ts: emittedAt, ...entry }));

  try {
    after(() => persistEntry(entry, emittedAt));
    return Promise.resolve();
  } catch {
    return persistEntry(entry, emittedAt);
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
