import { describe, expect, it } from "vitest";
import {
  ALREADY_REGISTERED_MESSAGE,
  GENERIC_AUTH_ERROR_MESSAGE,
  isExistingAccount,
  messageForAuthError,
  type AuthErrorLike,
} from "./errors";

describe("messageForAuthError", () => {
  it("maps rejected credentials", () => {
    expect(messageForAuthError({ code: "invalid_credentials" })).toBe(
      "Incorrect email or password",
    );
  });

  it("maps an unconfirmed email", () => {
    expect(messageForAuthError({ code: "email_not_confirmed" })).toContain(
      "Verify your email address",
    );
  });

  it("maps a rate limit", () => {
    expect(messageForAuthError({ code: "over_request_rate_limit" })).toBe(
      "Too many attempts. Please try again shortly.",
    );
  });

  it("falls back for an unknown code", () => {
    expect(messageForAuthError({ code: "mfa_challenge_expired" })).toBe(
      GENERIC_AUTH_ERROR_MESSAGE,
    );
    expect(messageForAuthError({ code: "not_a_real_supabase_code" })).toBe(
      GENERIC_AUTH_ERROR_MESSAGE,
    );
  });

  it("falls back when there is no code at all", () => {
    expect(messageForAuthError({})).toBe(GENERIC_AUTH_ERROR_MESSAGE);
    expect(messageForAuthError(null)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
    expect(messageForAuthError(undefined)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
    expect(messageForAuthError({ code: null })).toBe(GENERIC_AUTH_ERROR_MESSAGE);
    expect(messageForAuthError({ code: "" })).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("ignores the message text and branches on the code", () => {
    // Supabase rewords messages between releases, so the text must not matter.
    const error = {
      code: "invalid_credentials",
      message: "Invalid login credentials",
    } as AuthErrorLike & { message: string };

    expect(messageForAuthError(error)).toBe("Incorrect email or password");

    const reworded = {
      code: "invalid_credentials",
      message: "something completely different",
    } as AuthErrorLike & { message: string };

    expect(messageForAuthError(reworded)).toBe("Incorrect email or password");
  });

  it("never leaks a raw Supabase message to the user", () => {
    const error = {
      code: "unexpected_failure",
      message: "pq: relation \"auth.users\" does not exist",
    } as AuthErrorLike & { message: string };

    expect(messageForAuthError(error)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });
});

describe("registration error mappings", () => {
  it("maps a weak password and names the policy", () => {
    const message = messageForAuthError({ code: "weak_password" });
    expect(message).toContain("too weak");
    expect(message).toContain("symbol");
  });

  it("maps the confirmation-email rate limit", () => {
    expect(messageForAuthError({ code: "over_email_send_rate_limit" })).toBe(
      "Too many verification emails sent. Please wait a few minutes and try again.",
    );
  });

  it("maps an invalid email address", () => {
    expect(messageForAuthError({ code: "email_address_invalid" })).toBe(
      "Enter a valid email address",
    );
  });

  it("maps an address the project refuses", () => {
    expect(messageForAuthError({ code: "email_address_not_authorized" })).toContain(
      "university email",
    );
  });

  it("maps the explicit already-exists codes", () => {
    expect(messageForAuthError({ code: "user_already_exists" })).toBe(
      ALREADY_REGISTERED_MESSAGE,
    );
    expect(messageForAuthError({ code: "email_exists" })).toBe(
      ALREADY_REGISTERED_MESSAGE,
    );
  });
});

describe("isExistingAccount", () => {
  // With confirmations on, signUp on a taken address succeeds and returns an
  // obfuscated user with no identities. That empty array is the only signal.
  it("detects the obfuscated response for an address already registered", () => {
    expect(isExistingAccount({ identities: [] })).toBe(true);
  });

  it("treats a user with identities as genuinely new", () => {
    expect(isExistingAccount({ identities: [{ id: "abc" }] })).toBe(false);
  });

  it("does not guess when identities is missing or not an array", () => {
    expect(isExistingAccount({})).toBe(false);
    expect(isExistingAccount({ identities: null })).toBe(false);
    expect(isExistingAccount(null)).toBe(false);
  });
});

describe("messageForAuthError lookup safety", () => {
  // A plain object literal would return an inherited Object.prototype member
  // here, handing React a function and crashing the form.
  it("falls back for codes that collide with Object.prototype", () => {
    for (const code of ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"]) {
      const message = messageForAuthError({ code });
      expect(typeof message, `${code} should map to a string`).toBe("string");
      expect(message).toBe(GENERIC_AUTH_ERROR_MESSAGE);
    }
  });
});
