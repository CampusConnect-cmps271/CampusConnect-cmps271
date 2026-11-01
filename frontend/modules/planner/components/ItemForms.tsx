"use client";

import { useActionState, useState, type FormEvent } from "react";
import { addItem, removeItem, updateItem, type ItemActionState } from "../actions";
import { formatItemWhen } from "../calendar";
import { EMPTY_ITEM_FORM, PLANNER_LIMITS, validateItemForm, type ItemFieldErrors, type ItemFormValues } from "../schema";
import { timeFromMinutes } from "../time";
import type { PlanItem } from "../types";
import { FIELD_CLASS, FieldError, LABEL_CLASS, useHydrated } from "./MeetingForms";
import { PlannerButton } from "./PlannerButton";

/** A planned course an item can belong to. */
export type ItemCourseOption = { planCourseId: string; code: string };

/** The dates an item may use. */
type ItemDateRange = { first: string; last: string };

type ItemFieldsProps = {
  /** Makes the field ids unique on a page with many item forms. */
  idPrefix: string;
  formAction: (formData: FormData) => void;
  state: ItemActionState;
  pending: boolean;
  initialValues: ItemFormValues;
  /** Hidden fields: planId, plus itemId when editing. */
  fields: Record<string, string>;
  courses: readonly ItemCourseOption[];
  dateRange: ItemDateRange;
  submitLabel: string;
  /** Clear the fields after a successful save (adding, not editing). */
  resetOnSuccess?: boolean;
  onCancel?: () => void;
};

function ItemFields({
  idPrefix,
  formAction,
  state,
  pending,
  initialValues,
  fields,
  courses,
  dateRange,
  submitLabel,
  resetOnSuccess = false,
  onCancel,
}: ItemFieldsProps) {
  const [values, setValues] = useState(initialValues);
  const [clientErrors, setClientErrors] = useState<ItemFieldErrors>({});

  // A failed save returns what was typed; keep it. A new item clears.
  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.values) setValues(state.values);
    else if (state?.ok && resetOnSuccess) setValues(initialValues);
    setClientErrors({});
  }

  const errors: ItemFieldErrors = { ...state?.errors, ...clientErrors };
  const id = (field: string) => `${idPrefix}-${field}`;
  const describedBy = (field: keyof ItemFormValues, hint?: string) =>
    [hint, errors[field] ? id(`${field}-error`) : undefined].filter(Boolean).join(" ") || undefined;

  function update(field: keyof ItemFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (clientErrors[field]) setClientErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateItemForm(values, dateRange);
    if (result.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(result.errors);
  }

  const input = (field: "start" | "end", label: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id(field)} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id(field)}
        name={field}
        type="time"
        value={values[field]}
        onChange={(event) => update(field, event.target.value)}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field, id("times-hint"))}
        className={FIELD_CLASS}
      />
      <FieldError id={id(`${field}-error`)} message={errors[field]} />
    </div>
  );

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor={id("title")} className={LABEL_CLASS}>
          Title
        </label>
        <input
          id={id("title")}
          name="title"
          value={values.title}
          onChange={(event) => update("title", event.target.value)}
          maxLength={PLANNER_LIMITS.itemTitleLength}
          placeholder="e.g. CMPS 202 midterm"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy("title")}
          className={FIELD_CLASS}
        />
        <FieldError id={id("title-error")} message={errors.title} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <label htmlFor={id("date")} className={LABEL_CLASS}>
            Date
          </label>
          <input
            id={id("date")}
            name="date"
            type="date"
            min={dateRange.first}
            max={dateRange.last}
            value={values.date}
            onChange={(event) => update("date", event.target.value)}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={describedBy("date")}
            className={FIELD_CLASS}
          />
          <FieldError id={id("date-error")} message={errors.date} />
        </div>
        {input("start", "Starts")}
        {input("end", "Ends")}
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <label htmlFor={id("planCourseId")} className={LABEL_CLASS}>
            Course
          </label>
          <select
            id={id("planCourseId")}
            name="planCourseId"
            value={values.planCourseId}
            onChange={(event) => update("planCourseId", event.target.value)}
            aria-invalid={errors.planCourseId ? true : undefined}
            aria-describedby={describedBy("planCourseId")}
            className={FIELD_CLASS}
          >
            <option value="">None</option>
            {courses.map((course) => (
              <option key={course.planCourseId} value={course.planCourseId}>
                {course.code}
              </option>
            ))}
          </select>
          <FieldError id={id("planCourseId-error")} message={errors.planCourseId} />
        </div>
      </div>
      <p id={id("times-hint")} className="text-xs text-[var(--ink-soft)]">
        Beirut time. Leave both times empty for an all-day item; all-day items aren&apos;t checked for overlaps.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--maroon)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)]"
          >
            Cancel
          </button>
        ) : null}
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${state?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {pending ? "" : state?.message}
        </p>
      </div>
    </form>
  );
}

/** "Add an exam or other item". A native disclosure, so it opens by keyboard and before hydration. */
export function AddItemForm({ planId, courses, dateRange }: { planId: string; courses: readonly ItemCourseOption[]; dateRange: ItemDateRange }) {
  const [state, formAction, pending] = useActionState(addItem, undefined);

  return (
    <details className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">
        Add an exam or other item
      </summary>
      <div className="mt-3">
        <ItemFields
          idPrefix="add-item"
          formAction={formAction}
          state={state}
          pending={pending}
          initialValues={EMPTY_ITEM_FORM}
          fields={{ planId }}
          courses={courses}
          dateRange={dateRange}
          submitLabel="Save item"
          resetOnSuccess
        />
      </div>
    </details>
  );
}

type ItemRowProps = {
  planId: string;
  item: PlanItem;
  courses: readonly ItemCourseOption[];
  dateRange: ItemDateRange;
  /** This item overlaps something else on the calendar. */
  conflict?: boolean;
  /** Why the conflict check couldn't place it, and what to fix. */
  problem?: string;
};

/** One of the student's items, with Edit and Remove. Its id is the anchor the calendar links to. */
export function ItemRow({ planId, item, courses, dateRange, conflict = false, problem }: ItemRowProps) {
  const [state, formAction, pending] = useActionState(updateItem, undefined);
  const [editing, setEditing] = useState(false);
  // Edit needs JavaScript; until the page hydrates it is disabled, not dead.
  const hydrated = useHydrated();

  // A successful edit closes the form; the page shows the saved item.
  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.ok) setEditing(false);
  }

  const course = courses.find((option) => option.planCourseId === item.plan_course_id);
  const when = formatItemWhen(item);

  return (
    <li
      id={`item-${item.id}`}
      className={`flex scroll-mt-24 flex-col gap-2 rounded-md px-3 py-2 ${
        conflict || problem ? "border-l-4 border-[var(--danger)] bg-[#fdecea]" : "bg-[#fff6e5]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 text-sm text-[var(--ink)]">
          <p className="font-medium">
            {item.title}
            {course ? <span className="font-normal text-[var(--ink-soft)]"> · {course.code}</span> : null}
          </p>
          <p className="text-[var(--ink-soft)]">{when}</p>
        </div>
        {conflict ? (
          <span className="rounded-full border border-[var(--danger)] bg-white px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">
            <span aria-hidden="true">⚠ </span>Overlaps something else
          </span>
        ) : null}
        <div className="ml-auto flex items-start gap-2">
          {editing ? null : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={!hydrated}
              aria-label={`Edit ${item.title}, ${when}`}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)] disabled:opacity-60"
            >
              Edit
            </button>
          )}
          <PlannerButton
            action={removeItem}
            fields={{ planId, itemId: item.id }}
            label={`Remove ${item.title}, ${when}`}
            variant="danger"
          >
            Remove
          </PlannerButton>
        </div>
      </div>
      {problem ? <p className="text-xs text-[var(--danger)]">{problem}</p> : null}
      {state?.ok && !editing ? (
        <p role="status" aria-live="polite" className="text-xs text-[var(--success)]">
          {state.message}
        </p>
      ) : null}
      {editing ? (
        <ItemFields
          idPrefix={`edit-item-${item.id}`}
          formAction={formAction}
          state={state}
          pending={pending}
          initialValues={{
            title: item.title,
            date: item.on_date,
            start: item.start_minute === null ? "" : timeFromMinutes(item.start_minute),
            end: item.end_minute === null ? "" : timeFromMinutes(item.end_minute),
            planCourseId: item.plan_course_id ?? "",
          }}
          fields={{ planId, itemId: item.id }}
          courses={courses}
          dateRange={dateRange}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}
