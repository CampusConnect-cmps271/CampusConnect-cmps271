"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { messageForAuthError } from "./errors";
import { safeNextPath } from "./navigation";
import { loginSchema } from "./schema";

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
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      message: messageForAuthError(error),
      email: parsed.data.email,
    };
  }

  // `redirect` throws, so nothing below it runs.
  redirect(safeNextPath(formData.get("next")));
}

/** Signs the current student out and returns them to the landing page. */
export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/");
}
