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
    <div className="field">
      <label htmlFor={fieldId}>
        {label}
      </label>

      <div className="password-wrap">
        <input
          id={fieldId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={describedBy}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-controls={fieldId}
          className="link-button password-toggle"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>

      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}

      {/* The password policy can fail several rules at once, so list them. */}
      {messages.length === 1 ? (
        <p id={errorId} className="field-error">
          {messages[0]}
        </p>
      ) : null}

      {messages.length > 1 ? (
        <div id={errorId} className="field-error">
          <p>Your password must:</p>
          <ul className="field-error-list">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
