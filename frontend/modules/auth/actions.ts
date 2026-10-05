"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";
import {
  ALREADY_REGISTERED_MESSAGE,
  isExistingAccount,
  messageForAuthError,
} from "./errors";
import { safeNextPath } from "./navigation";
import { loginSchema, registerSchema } from "./schema";

export type LoginFormState = {
  /** Per-field validation messages. */
  errors?: {
    email?: string[];
    password?: string[];
  };
  /** Form-level message, e.g. rejected credentials. */
  message?: string;
  /** Echoed back so the email field survives a failed submit. */
  email?: string;
};

/**
 * Signs a student in. Used with `useActionState`, hence the leading state
 * argument.
 *
 * A Server Action is a public POST endpoint, so it re-validates everything the
 * form already checked rather than trusting the submission.
 */
export async function login(
  _prevState: LoginFormState | undefined,
  formData: FormData,
): Promise<LoginFormState> {
  const rawEmail = formData.get("email");
  const submittedEmail = typeof rawEmail === "string" ? rawEmail : "";

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      errors: {
        email: fieldErrors.email,
        password: fieldErrors.password,
      },
      email: submittedEmail,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // The email is masked by redact(); the password never leaves this scope.
    log.warn("auth.login.failure", {
      email: parsed.data.email,
      code: error.code ?? null,
      status: error.status ?? null,
    });

    return {
      message: messageForAuthError(error),
      email: parsed.data.email,
    };
  }

  log.info(
    "auth.login.success",
    { email: parsed.data.email },
    { userId: data.user?.id ?? null },
  );

  // `redirect` throws, so nothing below it runs.
  redirect(safeNextPath(formData.get("next")));
}

export type RegisterFieldErrors = {
  fullName?: string[];
  email?: string[];
  password?: string[];
  confirmPassword?: string[];
};

export type RegisterFormState =
  | { status: "idle" }
  | {
      status: "error";
      errors?: RegisterFieldErrors;
      message?: string;
      /** Echoed back so a failed submit does not clear what was typed. */
      values?: { fullName: string; email: string };
    }
  /** Account created; the confirmation email is on its way. */
  | { status: "sent"; email: string };

/**
 * Creates an account. Used with `useActionState`, hence the leading state
 * argument.
 *
 * Email confirmation is on, so this never signs the student in: they confirm
 * from the email first. The confirmation route is SP1-20 (Ghosn).
 */
export async function register(
  _prevState: RegisterFormState | undefined,
  formData: FormData,
): Promise<RegisterFormState> {
  const rawFullName = formData.get("fullName");
  const rawEmail = formData.get("email");
  const values = {
    fullName: typeof rawFullName === "string" ? rawFullName : "",
    email: typeof rawEmail === "string" ? rawEmail : "",
  };

  const parsed = registerSchema.safeParse({
    fullName: rawFullName,
    email: rawEmail,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      status: "error",
      errors: {
        fullName: fieldErrors.fullName,
        email: fieldErrors.email,
        password: fieldErrors.password,
        confirmPassword: fieldErrors.confirmPassword,
      },
      values,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Reachable later as user_metadata.full_name.
      data: { full_name: parsed.data.fullName },
      // No emailRedirectTo on purpose: the confirmation email carries an
      // 8-digit code, not a link, and is entered at /verify-email (SCRUM-106).
    },
  });

  if (error) {
    log.warn("auth.signup.failure", {
      email: parsed.data.email,
      code: error.code ?? null,
      status: error.status ?? null,
    });

    return {
      status: "error",
      message: messageForAuthError(error),
      values,
    };
  }

  if (isExistingAccount(data.user)) {
    log.warn("auth.signup.failure", {
      email: parsed.data.email,
      code: "already_registered",
    });

    return {
      status: "error",
      message: ALREADY_REGISTERED_MESSAGE,
      values,
    };
  }

  log.info(
    "auth.signup.success",
    { email: parsed.data.email },
    { userId: data.user?.id ?? null },
  );

  return { status: "sent", email: parsed.data.email };
}

/** Signs the current student out and returns them to the landing page. */
export async function logout(): Promise<void> {
  const supabase = await createClient();

  // Read the identity before signing out, or there is nothing left to log.
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  await supabase.auth.signOut();

  log.info("auth.logout", {}, { userId });

  redirect("/");
}
