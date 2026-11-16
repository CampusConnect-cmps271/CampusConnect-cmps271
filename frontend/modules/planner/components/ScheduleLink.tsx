"use client";

import { useActionState } from "react";
import { linkSemester } from "../actions";
import { importedOn } from "../sections";
import type { ImportedSemester } from "../types";
import { FIELD_CLASS, LABEL_CLASS } from "./MeetingForms";

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
 * Which AUB schedule fills in the plan's class times (SCRUM-243): says where
 * the times come from, and links, changes or clears it.
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
          <option value="">None: I&apos;ll type all class times</option>
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

  return (
    <section aria-label="Class times from AUB's schedule" className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-3">
      {semester ? (
        <>
          <p className="text-sm text-[var(--ink)]">
            Class times from AUB&apos;s <strong>{semester.name}</strong> schedule, imported {importedOn(semester.synced_at)} via{" "}
            <a href={RESIS_URL} className="underline" target="_blank" rel="noreferrer">
              Resis
            </a>
            . Choose a section for each course and its days and times fill in.
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">
              Change or clear the schedule
            </summary>
            <div className="mt-2">{form}</div>
          </details>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--ink)]">
            Fill in class times from AUB&apos;s imported schedule (via{" "}
            <a href={RESIS_URL} className="underline" target="_blank" rel="noreferrer">
              Resis
            </a>
            ) by choosing sections, instead of typing them.
          </p>
          {form}
        </>
      )}
    </section>
  );
}
