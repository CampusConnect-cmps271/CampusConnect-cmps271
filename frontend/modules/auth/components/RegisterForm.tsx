"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { isFrameworkNavigation, logClient } from "@/modules/logging/client";
import { register, type RegisterFormState } from "../actions";
import { LOGIN_PATH, verifyEmailPathFor } from "../navigation";
import { PASSWORD_HINT } from "../password";
import { PasswordInput } from "./PasswordInput";

const INITIAL_STATE: RegisterFormState = { status: "idle" };

export function RegisterForm() {
  // See LoginForm: wrap the action so a request that never reaches the server
  // is reported, instead of watching for a state the server already logged.
  const [state, formAction, pending] = useActionState(
    async (previous: RegisterFormState, formData: FormData) => {
      try {
        return await register(previous, formData);
      } catch (error) {
        if (!isFrameworkNavigation(error)) {
          logClient("auth.signup.client_failure", { form: "register" });
        }
        throw error;
      }
    },
    INITIAL_STATE,
  );
  const nameId = useId();
  const emailId = useId();

  const errors = state.status === "error" ? state.errors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  const nameError = errors?.fullName?.[0];
  const emailError = errors?.email?.[0];

  // Account created: the form is done, so replace it rather than leave a
  // filled-in form the student might submit again.
  if (state.status === "sent") {
    return (
      <div role="status" className="auth-success">
        <div className="auth-success-icon" aria-hidden="true">
          ✉
        </div>
        <h2>Check your university email for your code</h2>
        <p>
          We sent an 8-digit verification code to <strong>{state.email}</strong>
          . Enter it to activate your account, then log in.
        </p>
        <p>
          Nothing in your inbox? Check the spam folder. You can ask for a new
          code on the next page.
        </p>
        <Link
          href={verifyEmailPathFor(state.email)}
          className="btn btn-primary btn-block"
        >
          Enter your code
        </Link>
        <p className="auth-footer">
          Already verified? <Link href={LOGIN_PATH}>Log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="auth-form-grid">
      <p aria-live="polite" role="status" className="sr-only">
        {pending ? "Creating your account" : ""}
      </p>

      {state.status === "error" && state.message ? (
        <p role="alert" className="alert alert-error">
          {state.message}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor={nameId}>Full name</label>
        <input
          id={nameId}
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={values?.fullName}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
        />
        {nameError ? (
          <p id={`${nameId}-error`} className="field-error">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor={emailId}>University email</label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={values?.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
        />
        {emailError ? (
          <p id={`${emailId}-error`} className="field-error">
            {emailError}
          </p>
        ) : null}
      </div>

      <PasswordInput
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        errors={errors?.password}
      />

      <PasswordInput
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        errors={errors?.confirmPassword}
      />

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary btn-block"
      >
        {pending ? "Creating account…" : "Sign up"}
      </button>

      <p className="auth-footer">
        Already have an account? <Link href={LOGIN_PATH}>Log in</Link>
      </p>
    </form>
  );
}
