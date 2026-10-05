/**
 * Maps Supabase auth errors to messages we are willing to show a user.
 *
 * Always branch on `error.code`, never on `error.message`: the message text is
 * not part of Supabase's API and changes between releases.
 * Codes: https://supabase.com/docs/guides/auth/debugging/error-codes
 */

import { PASSWORD_HINT } from "./password";

export const GENERIC_AUTH_ERROR_MESSAGE =
  "Something went wrong. Please try again.";

/**
 * Shown when a sign-up targets an address that already has an account.
 *
 * With email confirmations on, Supabase does not report this as an error, to
 * avoid telling a stranger which addresses are registered. See
 * `isExistingAccount` below.
 */
export const ALREADY_REGISTERED_MESSAGE =
  "This email is already registered. Log in instead.";

/** Only what we need from an AuthError, so tests need no Supabase import. */
export type AuthErrorLike = {
  code?: string | null;
  status?: number;
};

// Null-prototype: a lookup for a code like "constructor" or "toString" must
// miss and fall back, not return an inherited Object.prototype member, which
// would hand a function to React and crash the form.
const MESSAGES_BY_CODE: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    // --- login ---
    invalid_credentials: "Incorrect email or password",
    // Verification is by 8-digit code at /verify-email (SCRUM-106).
    email_not_confirmed:
      "Verify your email address before logging in. Enter the code we emailed you.",
    over_request_rate_limit: "Too many attempts. Please try again shortly.",

    // --- registration ---
    weak_password: `That password is too weak. ${PASSWORD_HINT}`,
    over_email_send_rate_limit:
      "Too many verification emails sent. Please wait a few minutes and try again.",
    email_address_invalid: "Enter a valid email address",
    // Raised when the project refuses the address, which for us means the
    // university-domain hook (SCRUM-82) turned it down.
    email_address_not_authorized:
      "That email address cannot be used to sign up. Use your university email.",
    user_already_exists: ALREADY_REGISTERED_MESSAGE,
    email_exists: ALREADY_REGISTERED_MESSAGE,
  },
);

export function messageForAuthError(
  error: AuthErrorLike | null | undefined,
): string {
  const code = error?.code;
  if (!code) return GENERIC_AUTH_ERROR_MESSAGE;
  return MESSAGES_BY_CODE[code] ?? GENERIC_AUTH_ERROR_MESSAGE;
}

/** The parts of the signUp response we need in order to read it correctly. */
export type SignUpUserLike = {
  identities?: unknown[] | null;
} | null;

/**
 * Detects a sign-up for an address that already has an account.
 *
 * When email confirmations are enabled, `signUp` on an existing address
 * succeeds with no error and returns an obfuscated user whose `identities`
 * array is empty. That empty array is the only signal, so treat a missing or
 * non-array `identities` as "not an existing account" rather than guessing.
 */
export function isExistingAccount(user: SignUpUserLike): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}
