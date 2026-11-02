"use client";

import { useActionState, useState } from "react";
import { createPlan } from "../actions";
import { AUB_CALENDAR_SOURCE, formatTermDate, type OfficialTerm } from "../terms";

type NewPlanFormProps = {
  /** Official terms the student has no plan for yet and whose classes haven't ended. */
  terms: readonly OfficialTerm[];
};

/** "New plan": choose a term; its dates come from the AUB academic calendar. */
export function NewPlanForm({ terms }: NewPlanFormProps) {
  const [state, formAction, pending] = useActionState(createPlan, undefined);
  const [term, setTerm] = useState(terms[0]?.term ?? "");

  // A failed create returns the chosen term; keep it selected.
  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.term) setTerm(state.term);
  }

  if (terms.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-soft)]">
        You already have a plan for every term with published AUB dates. New terms appear here
        once the Registrar publishes them.
      </p>
    );
  }

  const chosen = terms.find((official) => official.term === term);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="new-plan-term" className="text-sm font-semibold text-[var(--ink)]">
          Term
        </label>
        <select
          id="new-plan-term"
          name="term"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-invalid={state?.error ? true : undefined}
          aria-describedby="new-plan-dates new-plan-error"
          className="w-full max-w-xs rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]"
        >
          {terms.map((official) => (
            <option key={official.term} value={official.term}>
              {official.term} ({official.aubName})
            </option>
          ))}
        </select>
      </div>

      <p id="new-plan-dates" className="text-sm text-[var(--ink-soft)]">
        {chosen ? (
          <>
            Classes run {formatTermDate(chosen.startsOn)} to {formatTermDate(chosen.endsOn)}, from
            the{" "}
            <a
              href={AUB_CALENDAR_SOURCE}
              className="font-medium text-[var(--maroon)] underline"
              target="_blank"
              rel="noreferrer"
            >
              official AUB academic calendar
            </a>
            .
          </>
        ) : null}
      </p>

      <p id="new-plan-error" role="alert" className="text-sm text-[var(--danger)]">
        {state?.error}
      </p>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create plan"}
        </button>
      </div>
    </form>
  );
}
