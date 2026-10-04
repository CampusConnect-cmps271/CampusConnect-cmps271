/**
 * Maps Supabase auth errors to messages we are willing to show a user.
 *
 * Always branch on `error.code`, never on `error.message`: the message text is
 * not part of Supabase's API and changes between releases.
 * Codes: https://supabase.com/docs/guides/auth/debugging/error-codes
 */

export const GENERIC_AUTH_ERROR_MESSAGE =
  "Something went wrong. Please try again.";

/** Only what we need from an AuthError, so tests need no Supabase import. */
export type AuthErrorLike = {
  code?: string | null;
  status?: number;
};

const MESSAGES_BY_CODE: Record<string, string> = {
  invalid_credentials: "Incorrect email or password",
  // SP1-21 (Ghosn) will add a verification page to link to from here.
  email_not_confirmed:
    "Confirm your email address before logging in. Check your inbox for the confirmation link.",
  over_request_rate_limit: "Too many attempts. Please try again shortly.",
};

export function messageForAuthError(
  error: AuthErrorLike | null | undefined,
): string {
  const code = error?.code;
  if (!code) return GENERIC_AUTH_ERROR_MESSAGE;
  return MESSAGES_BY_CODE[code] ?? GENERIC_AUTH_ERROR_MESSAGE;
}
