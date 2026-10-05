/**
 * Strips anything sensitive out of a log entry.
 *
 * Runs on the server before every insert, and in the browser before anything
 * is sent to /api/log. The server runs it again on whatever the browser sends,
 * because a client can post whatever it likes.
 *
 * SCRUM-24 is explicit that logs must never contain passwords, authentication
 * tokens, private-message content or sensitive student information.
 */

export const REDACTED = "[redacted]";

/**
 * Key fragments that mean "never store the value".
 *
 * Matched against the key with case and separators stripped, and by substring,
 * so `accessToken`, `access-token`, `X_ACCESS_TOKEN` and `refreshTokenValue`
 * are all caught. Over-redacting a log line is cheap; under-redacting is not.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "apikey",
  "credential",
  "session",
  // Message bodies: private-message content must never be logged.
  "body",
  "content",
];

const MAX_STRING_LENGTH = 200;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 20;
const TRUNCATION_SUFFIX = "…[truncated]";

/** Local part kept to one character: a***@mail.aub.edu. */
const EMAIL_PATTERN = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  const normalised = normaliseKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
    normalised.includes(fragment),
  );
}

export function maskEmails(value: string): string {
  return value.replace(EMAIL_PATTERN, (_match, first, domain) => `${first}***@${domain}`);
}

function redactString(value: string): string {
  const masked = maskEmails(value);
  if (masked.length <= MAX_STRING_LENGTH) return masked;
  return `${masked.slice(0, MAX_STRING_LENGTH)}${TRUNCATION_SUFFIX}`;
}

function redactValue(
  value: unknown,
  depth: number,
  /** Objects on the current path from the root, for cycle detection. */
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();

  // Functions and symbols carry nothing useful to a log reader.
  if (typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (depth >= MAX_DEPTH) return "[depth limit]";

  if (typeof value === "object") {
    // `seen` tracks the current ancestor path, not everything ever visited, so
    // that a genuine cycle is caught while an object merely referenced twice
    // in one context still gets redacted properly both times. Forgetting to
    // remove it on the way out silently replaces the second mention with
    // "[circular]" and loses the data.
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    try {
      if (Array.isArray(value)) {
        const items = value
          .slice(0, MAX_ARRAY_ITEMS)
          .map((item) => redactValue(item, depth + 1, seen));

        if (value.length > MAX_ARRAY_ITEMS) {
          items.push(`[${value.length - MAX_ARRAY_ITEMS} more]`);
        }

        return items;
      }

      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        if (isSensitiveKey(key)) {
          result[key] = REDACTED;
          continue;
        }

        const redacted = redactValue(item, depth + 1, seen);
        if (redacted !== undefined) result[key] = redacted;
      }

      return result;
    } finally {
      seen.delete(value);
    }
  }

  return String(value);
}

/** Redacts a context object. Always returns a plain, JSON-safe object. */
export function redact(
  context: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return {};
  }

  return redactValue(context, 0, new WeakSet()) as Record<string, unknown>;
}

/** Redacts a free-text message, which is masked and truncated but not dropped. */
export function redactMessage(message: string | undefined | null): string | null {
  if (typeof message !== "string" || message.length === 0) return null;
  return redactString(message);
}
