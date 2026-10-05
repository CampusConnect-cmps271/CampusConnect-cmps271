const MAX_STACK_FRAMES = 12;
const ACCOUNT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ErrorLike = Error & { digest?: unknown };

export type ErrorDetails = {
  name: string;
  message: string;
  stack: string[];
  digest?: string;
};

export function describeError(value: unknown): ErrorDetails {
  const error = value instanceof Error ? (value as ErrorLike) : null;
  const message = error?.message ?? String(value);
  const stack = error?.stack
    ?.split("\n")
    .map((frame) => frame.trim())
    .filter(Boolean)
    .slice(0, MAX_STACK_FRAMES) ?? [];
  const digest =
    error && typeof error.digest === "string" ? error.digest : undefined;

  return {
    name: error?.name ?? "UnknownError",
    message,
    stack,
    ...(digest ? { digest } : {}),
  };
}

export function pathnameOnly(path: string): string {
  try {
    return new URL(path, "https://campusconnect.invalid").pathname;
  } catch {
    return path.split(/[?#]/, 1)[0] || "/";
  }
}

export function accountIdFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "x-account-id",
  )?.[1];
  const value = Array.isArray(entry) ? entry[0] : entry;
  return typeof value === "string" && ACCOUNT_ID_PATTERN.test(value)
    ? value
    : null;
}

export function clientErrorContext(
  error: unknown,
  environment: { page: string; browser: string },
  extra: Record<string, unknown> = {},
) {
  const details = describeError(error);
  return {
    page: pathnameOnly(environment.page),
    browser: environment.browser,
    error_name: details.name,
    stack: details.stack,
    ...(details.digest ? { digest: details.digest } : {}),
    ...extra,
  };
}
