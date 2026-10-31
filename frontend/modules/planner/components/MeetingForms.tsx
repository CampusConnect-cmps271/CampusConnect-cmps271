"use client";

import { useActionState, useState, useSyncExternalStore, type FormEvent } from "react";
import { addMeeting, removeMeeting, updateMeeting, type MeetingActionState } from "../actions";
import {
  EMPTY_MEETING_FORM,
  PLANNER_TIMEZONE,
  validateMeetingForm,
  type MeetingFieldErrors,
  type MeetingFormValues,
} from "../schema";
import { formatMeeting, timeFromMinutes, WEEKDAYS } from "../time";
import type { Meeting } from "../types";
import { PlannerButton } from "./PlannerButton";

const FIELD_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)] aria-[invalid=true]:border-[var(--danger)]";

const LABEL_CLASS = "block text-xs font-semibold text-[var(--ink)]";

const noSubscription = () => () => {};

/** False in the server HTML and until hydration, then true. */
function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

type MeetingFieldsProps = {
  /** Makes the field ids unique on a page with many meeting forms. */
  idPrefix: string;
  formAction: (formData: FormData) => void;
  state: MeetingActionState;
  pending: boolean;
  initialValues: MeetingFormValues;
  /** Hidden fields: planId plus planCourseId or meetingId. */
  fields: Record<string, string>;
  submitLabel: string;
  /** Clear the fields after a successful save (adding, not editing). */
  resetOnSuccess?: boolean;
  onCancel?: () => void;
};

function MeetingFields({
  idPrefix,
  formAction,
  state,
  pending,
  initialValues,
  fields,
  submitLabel,
  resetOnSuccess = false,
  onCancel,
}: MeetingFieldsProps) {
  const [values, setValues] = useState(initialValues);
  const [clientErrors, setClientErrors] = useState<MeetingFieldErrors>({});

  // A failed save returns what was typed; keep it. A new meeting clears.
  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.values) setValues(state.values);
    else if (state?.ok && resetOnSuccess) setValues(initialValues);
    setClientErrors({});
  }

  const errors: MeetingFieldErrors = { ...state?.errors, ...clientErrors };
  const id = (field: string) => `${idPrefix}-${field}`;
  const describedBy = (field: keyof MeetingFormValues) => (errors[field] ? id(`${field}-error`) : undefined);

  function update(field: keyof MeetingFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (clientErrors[field]) setClientErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateMeetingForm(values);
    if (result.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(result.errors);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <label htmlFor={id("weekday")} className={LABEL_CLASS}>
            Day
          </label>
          <select
            id={id("weekday")}
            name="weekday"
            value={values.weekday}
            onChange={(event) => update("weekday", event.target.value)}
            aria-invalid={errors.weekday ? true : undefined}
            aria-describedby={describedBy("weekday")}
            className={FIELD_CLASS}
          >
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={String(day.value)}>
                {day.long}
              </option>
            ))}
          </select>
          <FieldError id={id("weekday-error")} message={errors.weekday} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={id("start")} className={LABEL_CLASS}>
            Starts
          </label>
          <input
            id={id("start")}
            name="start"
            type="time"
            value={values.start}
            onChange={(event) => update("start", event.target.value)}
            aria-invalid={errors.start ? true : undefined}
            aria-describedby={describedBy("start")}
            className={FIELD_CLASS}
          />
          <FieldError id={id("start-error")} message={errors.start} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={id("end")} className={LABEL_CLASS}>
            Ends
          </label>
          <input
            id={id("end")}
            name="end"
            type="time"
            value={values.end}
            onChange={(event) => update("end", event.target.value)}
            aria-invalid={errors.end ? true : undefined}
            aria-describedby={describedBy("end")}
            className={FIELD_CLASS}
          />
          <FieldError id={id("end-error")} message={errors.end} />
        </div>

        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <label htmlFor={id("timezone")} className={LABEL_CLASS}>
            Time zone
          </label>
          <input
            id={id("timezone")}
            name="timezone"
            value={PLANNER_TIMEZONE}
            readOnly
            aria-describedby={id("timezone-hint")}
            className={`${FIELD_CLASS} bg-[var(--maroon-50)]`}
          />
          <p id={id("timezone-hint")} className="text-xs text-[var(--ink-soft)]">
            Beirut time only, for now.
          </p>
          <FieldError id={id("timezone-error")} message={errors.timezone} />
        </div>
      </div>

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

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-[var(--danger)]">
      {message}
    </p>
  );
}

/**
 * "Add a meeting" for one planned course. A native disclosure, so it opens
 * by keyboard and before the page has hydrated.
 */
export function AddMeetingForm({ planId, planCourseId, courseCode }: { planId: string; planCourseId: string; courseCode: string }) {
  const [state, formAction, pending] = useActionState(addMeeting, undefined);
  const panelId = `add-meeting-${planCourseId}`;

  return (
    <details className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">
        Add a meeting for {courseCode}
      </summary>
      <div className="mt-3">
        <MeetingFields
          idPrefix={panelId}
          formAction={formAction}
          state={state}
          pending={pending}
          initialValues={EMPTY_MEETING_FORM}
          fields={{ planId, planCourseId }}
          submitLabel="Save meeting"
          resetOnSuccess
        />
      </div>
    </details>
  );
}

/** One typed meeting, labelled tentative, with Edit and Remove. */
export function MeetingItem({ planId, meeting }: { planId: string; meeting: Meeting }) {
  const [state, formAction, pending] = useActionState(updateMeeting, undefined);
  const [editing, setEditing] = useState(false);
  // Edit needs JavaScript; until the page hydrates it is disabled, not dead.
  const hydrated = useHydrated();

  // A successful edit closes the form; the page shows the saved time.
  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.ok) setEditing(false);
  }

  const label = formatMeeting(meeting);

  return (
    <li className="flex flex-col gap-2 rounded-md bg-[var(--maroon-50)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
        <span className="rounded-full border border-[var(--maroon-200)] bg-white px-2 py-0.5 text-xs text-[var(--maroon)]">
          Tentative, entered by you
        </span>
        <div className="ml-auto flex items-start gap-2">
          {editing ? null : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={!hydrated}
              aria-label={`Edit meeting ${label}`}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)] disabled:opacity-60"
            >
              Edit
            </button>
          )}
          <PlannerButton
            action={removeMeeting}
            fields={{ planId, meetingId: meeting.id }}
            label={`Remove meeting ${label}`}
            variant="danger"
          >
            Remove
          </PlannerButton>
        </div>
      </div>
      {state?.ok && !editing ? (
        <p role="status" aria-live="polite" className="text-xs text-[var(--success)]">
          {state.message}
        </p>
      ) : null}
      {editing ? (
        <MeetingFields
          idPrefix={`edit-meeting-${meeting.id}`}
          formAction={formAction}
          state={state}
          pending={pending}
          initialValues={{
            weekday: String(meeting.weekday),
            start: timeFromMinutes(meeting.start_minute),
            end: timeFromMinutes(meeting.end_minute),
            timezone: PLANNER_TIMEZONE,
          }}
          fields={{ planId, meetingId: meeting.id }}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}
