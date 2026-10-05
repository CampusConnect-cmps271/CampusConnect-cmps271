import type { SupabaseClient } from "@supabase/supabase-js";

// Matches the code received from this project's saved confirmation template.
export const VERIFICATION_CODE_LENGTH = 8;
export const RESEND_COOLDOWN_SECONDS = 60;

type Auth = Pick<SupabaseClient["auth"], "verifyOtp" | "resend">;
type Operation = "verify" | "resend";
export type VerificationResult = {
  ok: boolean;
  message: string;
  cooldown?: number;
};

export function normalizeUniversityEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@mail\.aub\.edu$/.test(email) ? email : null;
}

export function normalizeVerificationCode(value: string) {
  const code = value.replace(/\s/g, "");
  return new RegExp(`^[0-9]{${VERIFICATION_CODE_LENGTH}}$`).test(code) ? code : null;
}

export function verificationError(error: unknown, operation: Operation): VerificationResult {
  const details = error && typeof error === "object"
    ? error as { code?: string; status?: number }
    : {};

  if (details.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(details.code ?? "")) {
    return {
      ok: false,
      message: "Too many requests. Please wait a few minutes before trying again.",
      ...(operation === "resend" ? { cooldown: RESEND_COOLDOWN_SECONDS } : {}),
    };
  }

  if (details.code === "otp_expired") {
    return { ok: false, message: "That code is invalid or has expired. Check your latest email or request a new code." };
  }

  if (details.code === "request_timeout" || (details.status ?? 0) >= 500 || (!details.code && !details.status)) {
    return { ok: false, message: "We couldn't complete the request. Check your connection and try again shortly." };
  }

  return {
    ok: false,
    message: operation === "verify"
      ? "We couldn't verify that code. Check the email address and latest code, or request a new code."
      : "We couldn't resend the code. Please try again shortly.",
  };
}

export async function verifyUniversityEmail(auth: Auth, emailInput: string, codeInput: string): Promise<VerificationResult> {
  const email = normalizeUniversityEmail(emailInput);
  if (!email) return { ok: false, message: "Enter your @mail.aub.edu email address." };

  const token = normalizeVerificationCode(codeInput);
  if (!token) return { ok: false, message: `Enter the ${VERIFICATION_CODE_LENGTH}-digit code from your email.` };

  try {
    const { data, error } = await auth.verifyOtp({ email, token, type: "email" });
    if (error) return verificationError(error, "verify");

    if (!data.session || !data.user?.email_confirmed_at ||
      data.user.email?.toLowerCase() !== email || data.session.user.id !== data.user.id) {
      return { ok: false, message: "Verification could not be completed. Please request a new code and try again." };
    }

    return { ok: true, message: "Your university email is verified. You're ready to continue." };
  } catch (error) {
    return verificationError(error, "verify");
  }
}

export async function resendUniversityCode(auth: Auth, emailInput: string): Promise<VerificationResult> {
  const email = normalizeUniversityEmail(emailInput);
  if (!email) return { ok: false, message: "Enter your @mail.aub.edu email address first." };

  try {
    const { error } = await auth.resend({ type: "signup", email });
    if (error) return verificationError(error, "resend");

    return {
      ok: true,
      message: "If this email has an account awaiting verification, a new code has been requested. Check Inbox and Junk/Spam.",
      cooldown: RESEND_COOLDOWN_SECONDS,
    };
  } catch (error) {
    return verificationError(error, "resend");
  }
}
