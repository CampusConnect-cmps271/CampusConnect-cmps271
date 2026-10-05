"use client";

import { useId, useState } from "react";

type PasswordInputProps = {
  name?: string;
  label?: string;
  autoComplete?: "current-password" | "new-password";
  required?: boolean;
  /** Validation messages for this field; the first one is shown. */
  errors?: string[];
  /** Hint rendered under the field, e.g. the registration password policy. */
  hint?: string;
};

/**
 * Password field with a show/hide toggle.
 *
 * Shared so registration (SP1-14) renders an identical field; that is why the
 * label, autocomplete hint and helper text are all props.
 */
export function PasswordInput({
  name = "password",
  label = "Password",
  autoComplete = "current-password",
  required = true,
  errors,
  hint,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const messages = errors ?? [];
  const hasError = messages.length > 0;

  const describedBy =
    [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {label}
      </label>

      <div className="relative">
        <input
          id={fieldId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={describedBy}
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 pr-20 text-base outline-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-sky-600 aria-[invalid]:border-red-600 dark:border-white/20"
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-controls={fieldId}
          className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-sky-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-400"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>

      {hint ? (
        <p id={hintId} className="text-xs opacity-70">
          {hint}
        </p>
      ) : null}

      {/* The password policy can fail several rules at once, so list them. */}
      {messages.length === 1 ? (
        <p id={errorId} className="text-sm text-red-700 dark:text-red-400">
          {messages[0]}
        </p>
      ) : null}

      {messages.length > 1 ? (
        <div id={errorId} className="text-sm text-red-700 dark:text-red-400">
          <p>Your password must:</p>
          <ul className="list-disc pl-5">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
