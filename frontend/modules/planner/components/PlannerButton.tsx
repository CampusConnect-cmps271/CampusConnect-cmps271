"use client";

import { useActionState, type ReactNode } from "react";
import type { PlannerActionState } from "../actions";

type PlannerButtonProps = {
  action: (state: PlannerActionState, formData: FormData) => Promise<PlannerActionState>;
  /** Hidden fields naming what to act on: planId, planCourseId, ... */
  fields: Record<string, string>;
  children: ReactNode;
  /** The button's accessible name when its text alone is ambiguous. */
  label?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
};

const VARIANTS = {
  primary:
    "bg-[var(--maroon)] text-white hover:bg-[var(--maroon-dark)] border border-[var(--maroon)]",
  secondary:
    "border border-[var(--border)] bg-white text-[var(--ink)] hover:border-[var(--maroon)] hover:text-[var(--maroon)]",
  danger: "border border-[var(--border)] bg-white text-[var(--danger)] hover:border-[var(--danger)]",
};

/** One planner button with its own form, so it works without JavaScript and by keyboard. */
export function PlannerButton({
  action,
  fields,
  children,
  label,
  variant = "secondary",
  className = "",
}: PlannerButtonProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className={`flex flex-col gap-1 ${className}`}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        aria-label={label}
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60 ${VARIANTS[variant]}`}
      >
        {children}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`text-xs ${state?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
      >
        {pending ? "" : state?.message}
      </p>
    </form>
  );
}
