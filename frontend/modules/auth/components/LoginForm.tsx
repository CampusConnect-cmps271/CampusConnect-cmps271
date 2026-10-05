"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { isFrameworkNavigation, logClient } from "@/modules/logging/client";
import { login, type LoginFormState } from "../actions";
import { REGISTER_PATH } from "../navigation";
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
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      {/* Rejected credentials and rate limits land here, not on a field. */}
      <p aria-live="polite" role="status" className="sr-only">
        {pending ? "Logging in" : ""}
      </p>

      {state?.message ? (
        <p
          role="alert"
          className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {state.message}
        </p>
      ) : null}

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
          defaultValue={state?.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-sky-600 aria-[invalid]:border-red-600 dark:border-white/20"
        />
        {emailError ? (
          <p id={emailErrorId} className="text-sm text-red-700 dark:text-red-400">
            {emailError}
          </p>
        ) : null}
      </div>

      <PasswordInput errors={state?.errors?.password} />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-700 px-4 py-2.5 text-base font-medium text-white transition-opacity hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>

      <p className="text-sm opacity-80">
        New to CampusConnect?{" "}
        <Link
          href={REGISTER_PATH}
          className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
