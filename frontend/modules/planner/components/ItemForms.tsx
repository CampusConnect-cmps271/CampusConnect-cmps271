"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { addItem, removeItem, updateItem, type ItemActionState, type PlannerActionState } from "../actions";
import { PLANNER_LIMITS, validateItemForm, type ItemFieldErrors, type ItemFormValues } from "../schema";
import { formatTermDate } from "../terms";
import { timeFromMinutes } from "../time";
import type { PlanItem } from "../types";
import { FIELD_CLASS, FieldError, LABEL_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./FormBits";

/** A planned course an item can belong to. */
export type ItemCourseOption = { planCourseId: string; code: string };

/** The dates an item may use. */
export type ItemDateRange = { first: string; last: string };

/** What the item dialog is open for: a new item at a date (and time), or an existing item. */
export type ItemDialogTarget = { mode: "add"; date: string; start: number | null } | { mode: "edit"; item: PlanItem };

const LAST_MINUTE = 23 * 60 + 59;

type ItemFieldsProps = {
  formAction: (formData: FormData) => void;
  state: ItemActionState;
  pending: boolean;
  initialValues: ItemFormValues;
  /** Hidden fields: planId, plus itemId when editing. */
  fields: Record<string, string>;
  courses: readonly ItemCourseOption[];
  dateRange: ItemDateRange;
  submitLabel: string;
  onCancel: () => void;
};

function ItemFields({ formAction, state, pending, initialValues, fields, courses, dateRange, submitLabel, onCancel }: ItemFieldsProps) {
  const [values, setValues] = useState(initialValues);
  const [clientErrors, setClientErrors] = useState<ItemFieldErrors>({});

  // A failed save returns what was typed; keep it.
  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.values) setValues(state.values);
    setClientErrors({});
  }

  const errors: ItemFieldErrors = { ...state?.errors, ...clientErrors };
  const id = (field: string) => `item-${field}`;
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

  const time = (field: "start" | "end", label: string) => (
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
          autoFocus
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy("title")}
          className={FIELD_CLASS}
        />
        <FieldError id={id("title-error")} message={errors.title} />
      </div>

      <div className="flex flex-col gap-1">
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

      <div className="grid grid-cols-2 gap-3">
        {time("start", "Starts")}
        {time("end", "Ends")}
      </div>
      <p id={id("times-hint")} className="-mt-1 text-xs text-[var(--ink-soft)]">
        Beirut time. Leave empty for all day.
      </p>

      <div className="flex flex-col gap-1">
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

      <p role="status" aria-live="polite" className="text-sm text-[var(--danger)]">
        {pending || state?.ok ? "" : state?.message}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

type BodyProps = {
  planId: string;
  courses: readonly ItemCourseOption[];
  dateRange: ItemDateRange;
  /** Closes the dialog after a successful save or delete. */
  onDone: () => void;
};

function AddItem({ planId, courses, dateRange, date, start, onDone }: BodyProps & { date: string; start: number | null }) {
  const [state, formAction, pending] = useActionState(async (previous: ItemActionState, formData: FormData) => {
    const result = await addItem(previous, formData);
    if (result?.ok) onDone();
    return result;
  }, undefined);

  return (
    <ItemFields
      formAction={formAction}
      state={state}
      pending={pending}
      initialValues={{
        title: "",
        date,
        start: start === null ? "" : timeFromMinutes(start),
        end: start === null ? "" : timeFromMinutes(Math.min(start + 60, LAST_MINUTE)),
        planCourseId: "",
      }}
      fields={{ planId }}
      courses={courses}
      dateRange={dateRange}
      submitLabel="Save item"
      onCancel={onDone}
    />
  );
}

function EditItem({ planId, courses, dateRange, item, onDone }: BodyProps & { item: PlanItem }) {
  const [state, formAction, pending] = useActionState(async (previous: ItemActionState, formData: FormData) => {
    const result = await updateItem(previous, formData);
    if (result?.ok) onDone();
    return result;
  }, undefined);
  const [removed, removeAction, removing] = useActionState(async (previous: PlannerActionState, formData: FormData) => {
    const result = await removeItem(previous, formData);
    if (result?.ok) onDone();
    return result;
  }, undefined);

  return (
    <div className="flex flex-col gap-3">
      <ItemFields
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
        onCancel={onDone}
      />
      <form action={removeAction} className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="itemId" value={item.id} />
        <button
          type="submit"
          disabled={removing}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--danger)] hover:border-[var(--danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
        >
          {removing ? "Deleting…" : "Delete item"}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-[var(--danger)]">
          {removing || removed?.ok ? "" : removed?.message}
        </p>
      </form>
    </div>
  );
}

/**
 * The calendar's item dialog: a new item where the student clicked, or an
 * existing item to change or delete. A native modal dialog, so focus stays
 * in it and Escape closes it.
 */
export function ItemDialog({
  target,
  openCount,
  onClose,
  ...body
}: Omit<BodyProps, "onDone"> & { target: ItemDialogTarget | null; openCount: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (target && !element.open) element.showModal();
    if (!target && element.open) element.close();
  }, [target]);

  const close = () => dialog.current?.close();
  const heading =
    target?.mode === "edit" ? "Edit item" : target ? `New item · ${formatTermDate(target.date)}` : "";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="item-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-white p-0 text-[var(--ink)] shadow-xl backdrop:bg-black/40"
    >
      {target ? (
        <div className="flex flex-col gap-3 p-5">
          <h2 id="item-dialog-title" className="text-base font-semibold">
            {heading}
          </h2>
          {target.mode === "add" ? (
            <AddItem key={openCount} {...body} date={target.date} start={target.start} onDone={close} />
          ) : (
            <EditItem key={openCount} {...body} item={target.item} onDone={close} />
          )}
        </div>
      ) : null}
    </dialog>
  );
}
