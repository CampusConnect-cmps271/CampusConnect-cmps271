import * as z from "zod";

export const LOG_LEVELS = ["info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Dotted, lowercase event name, e.g. auth.login.failure. */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9_]+){1,4}$/;

export const MAX_CONTEXT_ENTRIES = 20;
/** Bytes. Anything larger is a bug or an attempt to fill the table. */
export const MAX_LOG_BODY_BYTES = 8 * 1024;

/**
 * What /api/log accepts from a browser.
 *
 * Deliberately strict: an event name shape, a known level, and a small flat
 * context. Everything here is attacker-controlled, so the route also redacts
 * the context again after parsing.
 */
export const clientLogSchema = z.object({
  event: z
    .string({ error: "event is required" })
    .regex(EVENT_NAME_PATTERN, { error: "event must look like auth.login.failure" }),
  level: z.enum(LOG_LEVELS).default("info"),
  message: z.string().max(500).optional(),
  context: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length <= MAX_CONTEXT_ENTRIES, {
      error: `context may hold at most ${MAX_CONTEXT_ENTRIES} entries`,
    })
    .optional(),
});

export type ClientLogInput = z.infer<typeof clientLogSchema>;
