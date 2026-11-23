
"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  changeEventSaveAction,
  type EventSaveState,
} from "./save-actions";

type Props = {
  eventId: string;
  initiallySaved: boolean;
  initiallyEnabled: boolean;
  initiallyMinutes: number;
  canSave: boolean;
};

const initialEventSaveState: EventSaveState = {
  success: false,
  message: "",
  saved: null,
  reminderEnabled: null,
  minutesBefore: null,
  version: 0,
};

const REMINDER_OPTIONS = [
  { value: 0, label: "At event start" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
];

function ActionButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--maroon)] px-5 py-2.5 font-semibold text-white transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function UnsaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--danger)] px-4 py-2.5 font-semibold text-[var(--danger)] transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Removing..." : "Unsave Event"}
    </button>
  );
}

function ReminderFields({
  enabledInitially,
  minutesInitially,
}: {
  enabledInitially: boolean;
  minutesInitially: number;
}) {
  const [enabled, setEnabled] = useState(
    enabledInitially,
  );

  const [minutes, setMinutes] = useState(
    minutesInitially,
  );

  return (
    <fieldset className="min-w-0 space-y-5 rounded-xl border border-[var(--border)] bg-[var(--maroon-50)] p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold text-[var(--ink)]">Reminder settings</legend>
      <label className="flex cursor-pointer items-start gap-3 text-[var(--ink)]">
        <input
          type="checkbox"
          name="reminderEnabled"
          checked={enabled}
          onChange={(event) =>
            setEnabled(event.target.checked)
          }
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
          aria-describedby="event-reminder-opt-in-help"
        />

        <span className="font-medium">
          Enable event reminder
          <span id="event-reminder-opt-in-help" className="mt-1 block text-sm font-normal text-[var(--ink-soft)]">
            Optional. Turn this on to receive an in-app notification before the event. Saving an event does not require a reminder.
          </span>
        </span>
      </label>

      <div>
        <label
          htmlFor="event-reminder-time"
          className="block text-sm font-semibold text-[var(--ink)]"
        >
          Remind Me
        </label>

        <select
          id="event-reminder-time"
          name="minutesBefore"
          value={minutes}
          onChange={(event) =>
            setMinutes(Number(event.target.value))
          }
          disabled={!enabled}
          className="mt-2 min-h-11 w-full max-w-sm rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {REMINDER_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>

        {!enabled && (
          <input
            type="hidden"
            name="minutesBefore"
            value={minutes}
          />
        )}

        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Timing is based on the event start in Beirut local time (Asia/Beirut). Reminders appear in the CampusConnect notification bell only when enabled.
        </p>
      </div>
    </fieldset>
  );
}

export default function EventSaveControls({
  eventId,
  initiallySaved,
  initiallyEnabled,
  initiallyMinutes,
  canSave,
}: Props) {
  const [state, formAction] = useActionState(
    changeEventSaveAction,
    initialEventSaveState,
  );

  const saved = state.saved ?? initiallySaved;

  const enabledInitially =
    state.saved === false
      ? true
      : state.reminderEnabled ?? initiallyEnabled;

  const minutesInitially =
    state.saved === false
      ? 60
      : state.minutesBefore ?? initiallyMinutes;

  if (!saved && !canSave) {
    return (
      <section
        aria-labelledby="save-event-heading"
        className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6"
      >
        <h2
          id="save-event-heading"
          className="break-words text-xl font-semibold text-[var(--ink)]"
        >
          Save This Event
        </h2>

        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          This event cannot currently be saved.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="save-event-heading"
      className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6"
    >
      <h2
        id="save-event-heading"
        className="break-words text-xl font-semibold text-[var(--ink)]"
      >
        {saved ? "Saved Event" : "Save This Event"}
      </h2>

      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        {saved
          ? "This event is in your saved events. You can change your reminder settings without removing it."
          : "Save this event and choose whether to receive an in-app reminder."}
      </p>

      <p className="mt-3 inline-flex max-w-full items-center rounded-full border border-[var(--border)] bg-[var(--maroon-50)] px-3 py-1 text-sm font-semibold text-[var(--maroon)]" role="status">
        {saved ? "Saved to your events" : "Not saved yet"}
      </p>

      <form
        action={formAction}
        className="mt-5 space-y-5"
      >
        <input
          type="hidden"
          name="eventId"
          value={eventId}
        />

        <input
          type="hidden"
          name="intent"
          value={saved ? "preferences" : "save"}
        />

        <ReminderFields
          key={`${eventId}-${state.version}`}
          enabledInitially={enabledInitially}
          minutesInitially={minutesInitially}
        />

        {state.message && (
          <p
            role="status"
            aria-live="polite"
            className={
              state.success
                ? "rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
                : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            }
          >
            {state.message}
          </p>
        )}

        <ActionButton
          label={
            saved
              ? "Update Reminder Preferences"
              : "Save Event"
          }
          pendingLabel="Saving..."
        />
      </form>

      {saved && (
        <form
          action={formAction}
          className="mt-5 border-t border-[var(--border)] pt-5"
        >
          <input
            type="hidden"
            name="eventId"
            value={eventId}
          />

          <input
            type="hidden"
            name="intent"
            value="unsave"
          />

          <UnsaveButton />
        </form>
      )}
    </section>
  );
}
