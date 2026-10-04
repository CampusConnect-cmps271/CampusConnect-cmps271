import { describe, expect, it } from "vitest";
import {
  GENERIC_AUTH_ERROR_MESSAGE,
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
      "Confirm your email address",
    );
  });

  it("maps a rate limit", () => {
    expect(messageForAuthError({ code: "over_request_rate_limit" })).toBe(
      "Too many attempts. Please try again shortly.",
    );
  });

  it("falls back for an unknown code", () => {
    expect(messageForAuthError({ code: "weak_password" })).toBe(
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
