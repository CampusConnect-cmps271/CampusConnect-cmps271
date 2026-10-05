export const LOGIN_PATH = "/login";
export const REGISTER_PATH = "/register";
export const DEFAULT_SIGNED_IN_PATH = "/home";
/** Password recovery by emailed code (SCRUM-26). Public: a locked-out student has no session. */
export const FORGOT_PASSWORD_PATH = "/forgot-password";

/**
 * Code-entry page a new student is sent to after signing up (SCRUM-106).
 *
 * Verification is by 8-digit code, not a confirmation link, so sign-up passes
 * no emailRedirectTo: the email carries a code and nothing to click.
 */
export const VERIFY_EMAIL_PATH = "/verify-email";

/**
 * Link to the code-entry page with the address prefilled, so the student does
 * not retype what they just registered with.
 */
export function verifyEmailPathFor(email: string | null | undefined): string {
  const address = email?.trim();
  if (!address) return VERIFY_EMAIL_PATH;

  return `${VERIFY_EMAIL_PATH}?email=${encodeURIComponent(address)}`;
}

/**
 * Sanitises a `next` value before we redirect to it.
 *
 * A `next` parameter is attacker-controlled, so only a same-site relative path
 * is allowed through. Anything else falls back, which keeps the login form from
 * becoming an open redirect.
 */
export function safeNextPath(
  value: unknown,
  fallback: string = DEFAULT_SIGNED_IN_PATH,
): string {
  if (typeof value !== "string") return fallback;

  const candidate = value.trim();

  if (candidate.length === 0) return fallback;
  // Must be rooted: rejects "https://evil.test" and bare "dashboard".
  if (!candidate.startsWith("/")) return fallback;
  // "//evil.test" is protocol-relative and resolves to another origin.
  if (candidate.startsWith("//")) return fallback;
  // Browsers normalise backslashes to slashes, so "/\evil.test" escapes too.
  if (candidate.includes("\\")) return fallback;
  // Header/URL smuggling via control characters.
  if (/[\x00-\x1f\x7f]/.test(candidate)) return fallback;

  return candidate;
}

/**
 * Builds the login URL for a signed-out visitor, remembering where they were
 * headed so they land there after signing in.
 */
export function loginPathFor(pathname: string | null | undefined): string {
  const next = safeNextPath(pathname, "");

  if (next.length === 0 || next === LOGIN_PATH) return LOGIN_PATH;

  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
