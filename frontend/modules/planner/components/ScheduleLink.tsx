"use client";

import { useActionState } from "react";
import { linkSemester } from "../actions";
import { importedOn } from "../sections";
import type { ImportedSemester } from "../types";
import { FIELD_CLASS, LABEL_CLASS } from "./FormBits";

const RESIS_URL = "https://resis.org/";

type ScheduleLinkProps = {
  planId: string;
  /** The semester the plan is linked to, or null. */
  semester: ImportedSemester | null;
  /** Every semester with an imported schedule. */
  semesters: readonly ImportedSemester[];
  /** Resis's name for the plan's term, offered first. */
  suggestedName: string | null;
};

/**
 * Which AUB schedule the plan's class times come from (SCRUM-243): names
 * it, and links, changes or clears it.
 */
export function ScheduleLink({ planId, semester, semesters, suggestedName }: ScheduleLinkProps) {
  const [state, formAction, pending] = useActionState(linkSemester, undefined);
  if (!semester && semesters.length === 0) return null;

  const suggested = semesters.find((option) => option.name === suggestedName);
  const options = suggested ? [suggested, ...semesters.filter((option) => option !== suggested)] : semesters;
  const selectId = `schedule-link-${planId}`;

  const form = (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="planId" value={planId} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={selectId} className={LABEL_CLASS}>
          AUB schedule for this plan
        </label>
        <select id={selectId} name="semesterId" defaultValue={semester?.id ?? suggested?.id ?? ""} className={FIELD_CLASS}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} (imported {importedOn(option.synced_at)})
            </option>
          ))}
          <option value="">None</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[var(--maroon)] bg-[var(--maroon)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
      >
        {pending ? "Saving…" : semester ? "Save" : "Link"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`w-full text-sm ${state?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
      >
        {pending ? "" : state?.message}
      </p>
    </form>
  );

  const source = (
    <a href={RESIS_URL} className="underline" target="_blank" rel="noreferrer">
      Resis
    </a>
  );

  return (
    <section aria-label="Class times from AUB's schedule" className="flex flex-col gap-1 px-1 text-xs text-[var(--ink-soft)]">
      {semester ? (
        <>
          <p>
            Times from AUB&apos;s <strong className="text-[var(--ink)]">{semester.name}</strong> schedule via {source}, imported{" "}
            {importedOn(semester.synced_at)}. Check AUB SIS before you register.
          </p>
          <details>
            <summary className="cursor-pointer font-medium text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">
              Change schedule
            </summary>
            <div className="mt-2">{form}</div>
          </details>
        </>
      ) : (
        <>
          <p>Link AUB&apos;s schedule (via {source}) to choose sections and fill in class times.</p>
          {form}
        </>
      )}
    </section>
  );
}
