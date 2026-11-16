"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { findCourses } from "../actions";
import type { CourseOption } from "../types";
import { FIELD_CLASS, LABEL_CLASS, plural, SECONDARY_BUTTON } from "./styles";

type CoursePickerProps = {
  courseId: string;
  courseLabel: string;
  error?: string;
  onChange: (course: { id: string; label: string } | null) => void;
};

/**
 * Finds a catalogue course by code or name. Typing searches (after a short
 * pause); each result is a button, so it works with Tab and Enter. The
 * chosen course is sent as courseId, with its label to show it again after
 * a failed save.
 */
export function CoursePicker({ courseId, courseLabel, error, onChange }: CoursePickerProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseOption[] | null>(null);
  const [searching, startSearch] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const latest = useRef("");

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const timer = setTimeout(() => {
      latest.current = text;
      startSearch(async () => {
        const found = await findCourses(text);
        if (latest.current === text) setResults(found);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const errorId = `${id}-error`;

  function pick(course: CourseOption) {
    onChange({ id: course.id, label: `${course.code} · ${course.name}` });
    requestAnimationFrame(() => changeButton.current?.focus());
  }

  if (courseId) {
    return (
      <div className="flex flex-col gap-1">
        <span className={LABEL_CLASS} id={`${id}-label`}>
          Course
        </span>
        <div className="flex flex-wrap items-center gap-2" aria-labelledby={`${id}-label`} role="group">
          <span className="rounded-md bg-[var(--maroon-50)] px-3 py-2 text-sm font-medium text-[var(--ink)]">{courseLabel}</span>
          <button
            ref={changeButton}
            type="button"
            onClick={() => {
              onChange(null);
              setResults(null);
              setQuery("");
              requestAnimationFrame(() => input.current?.focus());
            }}
            className={SECONDARY_BUTTON}
          >
            Change course
          </button>
        </div>
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="courseLabel" value={courseLabel} />
      </div>
    );
  }

  const shown = query.trim().length >= 2 ? results : null;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-search`} className={LABEL_CLASS}>
        Course
      </label>
      <input
        ref={input}
        id={`${id}-search`}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // Enter picks the only match instead of submitting the form.
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (shown?.length === 1) pick(shown[0]);
        }}
        placeholder="Search by code or name, e.g. CMPS 271"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${errorId}` : ""}`}
        className={FIELD_CLASS}
      />
      <p id={`${id}-hint`} className="text-xs text-[var(--ink-soft)]">
        Type at least 2 characters, then choose a course.
      </p>
      <input type="hidden" name="courseId" value="" />
      <p role="status" aria-live="polite" className="text-xs text-[var(--ink-soft)]">
        {searching ? "Searching…" : shown ? (shown.length ? `${plural(shown.length, "course")} found` : "No courses match.") : ""}
      </p>
      {shown && shown.length > 0 ? (
        <ul aria-label="Matching courses" className="flex flex-col gap-1">
          {shown.map((course) => (
            <li key={course.id}>
              <button
                type="button"
                onClick={() => pick(course)}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-[var(--ink)] hover:border-[var(--maroon-200)] hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
              >
                <span className="font-semibold">{course.code}</span> · {course.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
