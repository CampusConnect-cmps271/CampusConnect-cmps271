"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { isFrameworkNavigation, logClient } from "@/modules/logging/client";
import { register, type RegisterFormState } from "../actions";
import { LOGIN_PATH, verifyEmailPathFor } from "../navigation";
import { PASSWORD_HINT } from "../password";
import { PasswordInput } from "./PasswordInput";

const INITIAL_STATE: RegisterFormState = { status: "idle" };

const FIELD_CLASS =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-sky-600 aria-[invalid]:border-red-600 dark:border-white/20";

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
      <div
        role="status"
        className="flex flex-col gap-4 rounded-md border border-emerald-600/30 bg-emerald-600/10 px-4 py-5"
      >
        <h2 className="text-lg font-semibold">
          Check your university email for your code
        </h2>
        <p className="text-sm opacity-90">
          We sent an 8-digit verification code to <strong>{state.email}</strong>
          . Enter it to activate your account, then log in.
        </p>
        <p className="text-sm opacity-80">
          Nothing in your inbox? Check the spam folder. You can ask for a new
          code on the next page.
        </p>
        <Link
          href={verifyEmailPathFor(state.email)}
          className="self-start rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        >
          Enter your code
        </Link>
        <p className="text-sm opacity-80">
          Already verified?{" "}
          <Link
            href={LOGIN_PATH}
            className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
          >
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <p aria-live="polite" role="status" className="sr-only">
        {pending ? "Creating your account" : ""}
      </p>

      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-sm font-medium">
          Full name
        </label>
        <input
          id={nameId}
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={values?.fullName}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
          className={FIELD_CLASS}
        />
        {nameError ? (
          <p id={`${nameId}-error`} className="text-sm text-red-700 dark:text-red-400">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-medium">
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
          defaultValue={values?.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
          className={FIELD_CLASS}
        />
        {emailError ? (
          <p id={`${emailId}-error`} className="text-sm text-red-700 dark:text-red-400">
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
        className="rounded-md bg-sky-700 px-4 py-2.5 text-base font-medium text-white transition-opacity hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Sign up"}
      </button>

      <p className="text-sm opacity-80">
        Already have an account?{" "}
        <Link
          href={LOGIN_PATH}
          className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
