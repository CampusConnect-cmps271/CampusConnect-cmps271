"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { isFrameworkNavigation, logClient } from "@/modules/logging/client";
import { login, type LoginFormState } from "../actions";
import { FORGOT_PASSWORD_PATH, REGISTER_PATH } from "../navigation";
import { PasswordInput } from "./PasswordInput";

const INITIAL_STATE: LoginFormState = {};

type LoginFormProps = {
  /** Already sanitised by the page; carried through the submit. */
  next: string;
};

export function LoginForm({ next }: LoginFormProps) {
  // Wrapping the action, not watching its result: a failure to reach the
  // server rejects here and never produces a state, which is exactly the case
  // worth reporting. Outcomes that do produce a state, such as a wrong
  // password, are already logged server-side and need no client row.
  const [state, formAction, pending] = useActionState(
    async (previous: LoginFormState, formData: FormData) => {
      try {
        return await login(previous, formData);
      } catch (error) {
        if (!isFrameworkNavigation(error)) {
          logClient("auth.login.client_failure", { form: "login" });
        }
        throw error;
      }
    },
    INITIAL_STATE,
  );
  const emailId = useId();
  const emailErrorId = `${emailId}-error`;
  const emailError = state?.errors?.email?.[0];

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="next" value={next} />

      {/* Rejected credentials and rate limits land here, not on a field. */}
      <p aria-live="polite" role="status" className="sr-only">
        {pending ? "Logging in" : ""}
      </p>

      {state?.message ? (
        <p role="alert" className="alert alert-error">
          {state.message}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor={emailId}>
          University email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state?.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
        />
        {emailError ? (
          <p id={emailErrorId} className="field-error">
            {emailError}
          </p>
        ) : null}
      </div>

      <div>
        <PasswordInput errors={state?.errors?.password} />
        <Link href={FORGOT_PASSWORD_PATH} className="link-button forgot-link">
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary btn-block"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>

      <p className="auth-footer">
        New to CampusConnect?{" "}
        <Link href={REGISTER_PATH}>
          Sign up
        </Link>
      </p>
    </form>
  );
}
