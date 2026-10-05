import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

// Run the actual TypeScript helper with the existing Node test runner.
const source = await readFile(new URL("../lib/auth/verification.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const {
  normalizeUniversityEmail, normalizeVerificationCode, verifyUniversityEmail, resendUniversityCode,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const email = "student@mail.aub.edu";
function verifiedData() {
  const user = { id: "student-id", email, email_confirmed_at: "2026-10-05T12:00:00Z" };
  return { user, session: { user } };
}

describe("SCRUM-106 email verification", () => {
  it("normalizes university addresses and rejects lookalike domains", () => {
    assert.equal(normalizeUniversityEmail(" STUDENT@MAIL.AUB.EDU "), email);
    for (const input of ["student@gmail.com", "student@aub.edu", "student@mail.aub.edu.evil", "student@sub.mail.aub.edu", "@mail.aub.edu", "student name@mail.aub.edu"]) {
      assert.equal(normalizeUniversityEmail(input), null);
    }
  });

  it("preserves leading zeros and accepts a spaced code pasted from email", () => {
    assert.equal(normalizeVerificationCode(" 0123 4567 "), "01234567");
    for (const code of ["123456", "123456789", "1234abcd", "1234-5678", ""]) {
      assert.equal(normalizeVerificationCode(code), null);
    }
  });

  it("does not call Supabase for invalid input", async () => {
    const auth = { verifyOtp() { throw new Error("Unexpected network call"); }, resend() { throw new Error("Unexpected network call"); } };
    assert.match((await verifyUniversityEmail(auth, "outsider@gmail.com", "01234567")).message, /@mail\.aub\.edu/);
    assert.match((await verifyUniversityEmail(auth, email, "123")).message, /8-digit/);
    assert.equal((await resendUniversityCode(auth, "outsider@gmail.com")).ok, false);
  });

  it("verifies the email OTP using the normalized email and the original digit string", async () => {
    const auth = { async verifyOtp(payload) {
      assert.deepEqual(payload, { email, token: "01234567", type: "email" });
      return { data: verifiedData(), error: null };
    } };
    assert.equal((await verifyUniversityEmail(auth, " STUDENT@MAIL.AUB.EDU ", "0123 4567")).ok, true);
  });

  it("handles wrong, expired, and already-used codes without reporting success", async () => {
    for (const code of ["otp_expired", "validation_failed", undefined]) {
      const auth = { async verifyOtp() { return { data: { user: null, session: null }, error: { code, status: 403 } }; } };
      const result = await verifyUniversityEmail(auth, email, "01234567");
      assert.equal(result.ok, false);
      assert.match(result.message, /code/i);
    }
  });

  it("requires a confirmed matching user and a session before succeeding", async () => {
    const incomplete = [
      { ...verifiedData(), session: null },
      { ...verifiedData(), user: null },
      { ...verifiedData(), user: { ...verifiedData().user, email_confirmed_at: null } },
      { ...verifiedData(), user: { ...verifiedData().user, email: "other@mail.aub.edu" } },
      { ...verifiedData(), session: { user: { id: "other-id" } } },
    ];
    for (const data of incomplete) {
      assert.equal((await verifyUniversityEmail({ async verifyOtp() { return { data, error: null }; } }, email, "01234567")).ok, false);
    }
  });

  it("resends an existing signup code without creating an account", async () => {
    const auth = { async resend(payload) {
      assert.deepEqual(payload, { type: "signup", email });
      return { error: null };
    } };
    const result = await resendUniversityCode(auth, email);
    assert.equal(result.ok, true);
    assert.equal(result.cooldown, 60);
    assert.match(result.message, /If this email has an account/);
  });

  it("handles rate limits and keeps a resend cooldown", async () => {
    for (const error of [{ status: 429 }, { code: "over_email_send_rate_limit" }, { code: "over_request_rate_limit" }]) {
      const result = await resendUniversityCode({ async resend() { return { error }; } }, email);
      assert.equal(result.ok, false);
      assert.equal(result.cooldown, 60);
      assert.match(result.message, /wait/);
    }
  });

  it("handles network exceptions and server timeouts without exposing raw errors", async () => {
    const auth = { async verifyOtp() { throw new Error("private upstream detail"); } };
    assert.match((await verifyUniversityEmail(auth, email, "01234567")).message, /connection/);
    const result = await resendUniversityCode({ async resend() { return { error: { status: 504, code: "request_timeout", message: "private upstream detail" } }; } }, email);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.message, /private upstream detail/);
  });
});
