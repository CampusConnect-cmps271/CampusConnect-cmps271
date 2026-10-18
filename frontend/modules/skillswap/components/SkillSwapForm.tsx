"use client";

import { useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import type { SkillSwapFormState } from "../actions";
import {
  MEETING_METHOD_OPTIONS,
  MEETING_METHODS,
  SKILLSWAP_LIMITS,
  validateSkillSwapForm,
  type SkillSwapFieldErrors,
  type SkillSwapFormValues,
} from "../schema";

type SkillSwapFormProps = {
  /** createSkillSwapPost, or updateSkillSwapPost bound to the post's id. */
  action: (state: SkillSwapFormState, formData: FormData) => Promise<SkillSwapFormState>;
  initialValues: SkillSwapFormValues;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
};

const FIELD_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)] aria-[invalid=true]:border-red-600";

const LABEL_CLASS = "block text-sm font-semibold text-gray-800";

/** The SkillSwap template: two boxes, meeting method, availability, details. */
export function SkillSwapForm({
  action,
  initialValues,
  submitLabel,
  pendingLabel,
  cancelHref,
}: SkillSwapFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [values, setValues] = useState(initialValues);
  const [clientErrors, setClientErrors] = useState<SkillSwapFieldErrors>({});

  // A failed save returns what was typed; show it and its errors.
  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.values) setValues(state.values);
    setClientErrors({});
  }

  const errors: SkillSwapFieldErrors = { ...state?.errors, ...clientErrors };

  function update(field: keyof SkillSwapFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (clientErrors[field]) setClientErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateSkillSwapForm(values);
    if (result.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(result.errors);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <SkillBox
          id="canTeach"
          label="I can teach"
          placeholder="e.g. Python for CMPS 200, guitar basics, Excel formulas"
          value={values.canTeach}
          max={SKILLSWAP_LIMITS.canTeach}
          error={errors.canTeach}
          onChange={(value) => update("canTeach", value)}
        />
        <SkillBox
          id="wantsToLearn"
          label="I want to learn"
          placeholder="e.g. Conversational French, photo editing, chess openings"
          value={values.wantsToLearn}
          max={SKILLSWAP_LIMITS.wantsToLearn}
          error={errors.wantsToLearn}
          onChange={(value) => update("wantsToLearn", value)}
        />
      </div>

      <fieldset aria-describedby={errors.meetingMethod ? "meetingMethod-error" : undefined}>
        <legend className={LABEL_CLASS}>Meeting method</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {MEETING_METHODS.map((method) => (
            <label
              key={method}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 has-[:checked]:border-[var(--maroon)] has-[:checked]:bg-[var(--maroon-50)]"
            >
              <input
                type="radio"
                name="meetingMethod"
                value={method}
                checked={values.meetingMethod === method}
                onChange={() => update("meetingMethod", method)}
                className="accent-[var(--maroon)]"
              />
              {MEETING_METHOD_OPTIONS[method]}
            </label>
          ))}
        </div>
        <FieldError id="meetingMethod-error" message={errors.meetingMethod} />
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="availability" className={LABEL_CLASS}>
          Availability <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <input
          id="availability"
          name="availability"
          value={values.availability}
          onChange={(event) => update("availability", event.target.value)}
          placeholder="e.g. Weekday evenings, Saturday mornings"
          aria-invalid={Boolean(errors.availability) || undefined}
          aria-describedby={errors.availability ? "availability-error" : undefined}
          className={FIELD_CLASS}
        />
        <FieldError id="availability-error" message={errors.availability} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="details" className={LABEL_CLASS}>
          Extra details <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <textarea
          id="details"
          name="details"
          rows={4}
          value={values.details}
          onChange={(event) => update("details", event.target.value)}
          placeholder="Your level, what a session could look like, where you'd like to meet…"
          aria-invalid={Boolean(errors.details) || undefined}
          aria-describedby={`details-count${errors.details ? " details-error" : ""}`}
          className={`${FIELD_CLASS} resize-y`}
        />
        <Counter id="details-count" length={values.details.trim().length} max={SKILLSWAP_LIMITS.details} />
        <FieldError id="details-error" message={errors.details} />
      </div>

      {state?.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--maroon)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-gray-700 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}

type SkillBoxProps = {
  id: "canTeach" | "wantsToLearn";
  label: string;
  placeholder: string;
  value: string;
  max: number;
  error?: string;
  onChange: (value: string) => void;
};

function SkillBox({ id, label, placeholder, value, max, error, onChange }: SkillBoxProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <label htmlFor={id} className="text-base font-semibold text-gray-900">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        rows={6}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`}
        className={`${FIELD_CLASS} resize-y`}
      />
      <Counter id={`${id}-count`} length={value.trim().length} max={max} />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
  const over = length > max;
  return (
    <p id={id} className={`text-right text-xs tabular-nums ${over ? "font-semibold text-red-600" : "text-gray-500"}`}>
      {length}/{max}
      {over ? <span className="sr-only"> characters, too long</span> : null}
    </p>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-red-600">
      {message}
    </p>
  );
}
