"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { chooseSections } from "../actions";
import { linkedPrompt, sectionCountLabel, type SectionOption, type SessionLine } from "../sections";
import type { ImportedSemester, PlannedCourse } from "../types";
import { useHydrated } from "./MeetingForms";

type SectionPickerProps = {
  planId: string;
  planned: Pick<PlannedCourse, "plan_course_id" | "code" | "name">;
  semester: ImportedSemester;
  options: readonly SectionOption[];
  /** CRNs chosen now, preselected. */
  chosen: readonly string[];
  /** Typed meetings that choosing a section replaces. */
  typedMeetings: number;
};

function sessionText(line: SessionLine): string {
  return [line.when ?? "Time to be announced", line.type, line.location, line.instructor].filter(Boolean).join(" · ");
}

function Sessions({ lines }: { lines: readonly SessionLine[] }) {
  if (!lines.length) return <p className="text-xs text-[var(--ink-soft)]">No meeting times listed.</p>;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-[var(--ink-soft)]">
      {lines.map((line, index) => (
        <li key={index}>{sessionText(line)}</li>
      ))}
    </ul>
  );
}

/**
 * Choose a planned course's section from AUB's imported schedule, plus a
 * section linked to it (a lab or recitation). The times fill in from the
 * schedule; the student never types them. Works without JavaScript: every
 * section's linked choices are shown, and only the chosen section's count.
 */
export function SectionPicker({ planId, planned, semester, options, chosen, typedMeetings }: SectionPickerProps) {
  const [state, formAction, pending] = useActionState(chooseSections, undefined);
  const hydrated = useHydrated();
  const initial = options.find((option) => chosen.includes(option.crn))?.crn ?? (options.length === 1 ? options[0].crn : "");
  const [selected, setSelected] = useState(initial);
  const headingId = `section-picker-${planned.plan_course_id}`;
  const statusId = `${headingId}-status`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border border-[var(--maroon)] bg-[var(--maroon-50)] p-3">
      <div>
        <h4 id={headingId} className="text-sm font-semibold text-[var(--ink)]">
          Choose a section of {planned.code}
        </h4>
        <p className="text-xs text-[var(--ink-soft)]">
          {sectionCountLabel(options.length)} in AUB&apos;s {semester.name} schedule (from Resis). The days and times fill in from it.
        </p>
      </div>

      {typedMeetings > 0 ? (
        <p className="rounded-md border border-[var(--danger)] bg-white px-3 py-2 text-sm text-[var(--danger)]">
          Choosing a section replaces the {typedMeetings === 1 ? "time" : `${typedMeetings} times`} you typed for {planned.code}.
        </p>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3" aria-describedby={statusId}>
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="planCourseId" value={planned.plan_course_id} />

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Sections of {planned.code}</legend>
          {options.map((option) => {
            const inputId = `${headingId}-${option.crn}`;
            const showLinked = option.linked.length > 0 && (!hydrated || selected === option.crn);
            return (
              <div key={option.crn} className="rounded-md border border-[var(--border)] bg-white px-3 py-2">
                <div className="flex items-start gap-2">
                  <input
                    id={inputId}
                    type="radio"
                    name="crn"
                    value={option.crn}
                    checked={selected === option.crn}
                    onChange={() => setSelected(option.crn)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={inputId} className="text-sm font-medium text-[var(--ink)]">
                      Section {option.section} · CRN {option.crn}
                      {option.types.length ? ` · ${option.types.join(" / ")}` : ""}
                    </label>
                    <Sessions lines={option.sessions} />
                    {option.instructors.length ? (
                      <p className="text-xs text-[var(--ink-soft)]">Instructors: {option.instructors.join(", ")}</p>
                    ) : null}
                    {option.linked.length && !showLinked ? (
                      <p className="text-xs text-[var(--ink-soft)]">
                        Linked: {option.linked.flatMap((group) => group.options.map((linked) => `CRN ${linked.crn}`)).join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>

                {showLinked
                  ? option.linked.map((group, groupIndex) => {
                      const prompt = linkedPrompt(option, group);
                      const groupName = `linked-${option.crn}-${groupIndex}`;
                      return (
                        <fieldset key={group.kind} className="mt-2 flex flex-col gap-1 border-t border-[var(--border)] pt-2 pl-6">
                          <legend className="text-sm text-[var(--ink)]">{prompt}</legend>
                          {group.options.length === 1 ? (
                            <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
                              <input
                                type="checkbox"
                                name={groupName}
                                value={group.options[0].crn}
                                defaultChecked={chosen.length === 0 || chosen.includes(group.options[0].crn)}
                                className="mt-1"
                              />
                              <span>
                                Add {group.options[0].label}
                                <Sessions lines={group.options[0].sessions} />
                              </span>
                            </label>
                          ) : (
                            <>
                              {group.options.map((linked) => (
                                <label key={linked.crn} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                                  <input
                                    type="radio"
                                    name={groupName}
                                    value={linked.crn}
                                    defaultChecked={chosen.includes(linked.crn)}
                                    className="mt-1"
                                  />
                                  <span>
                                    {linked.label}
                                    <Sessions lines={linked.sessions} />
                                  </span>
                                </label>
                              ))}
                              <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
                                <input
                                  type="radio"
                                  name={groupName}
                                  value=""
                                  defaultChecked={!group.options.some((linked) => chosen.includes(linked.crn))}
                                  className="mt-1"
                                />
                                <span>Not now</span>
                              </label>
                            </>
                          )}
                        </fieldset>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--maroon)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Use this section"}
          </button>
          <Link
            href={`/planner/${planId}#course-${planned.plan_course_id}`}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)]"
          >
            Cancel
          </Link>
          <p id={statusId} role="status" aria-live="polite" className="text-sm text-[var(--danger)]">
            {pending ? "" : state?.message}
          </p>
        </div>
      </form>
    </section>
  );
}
