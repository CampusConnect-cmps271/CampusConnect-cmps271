
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
      className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
      className="rounded-lg border border-red-400 px-4 py-2.5 font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-gray-800"
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
    <div className="space-y-5">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="reminderEnabled"
          checked={enabled}
          onChange={(event) =>
            setEnabled(event.target.checked)
          }
          className="h-4 w-4"
        />

        <span className="font-medium">
          Enable event reminder
        </span>
      </label>

      <div>
        <label
          htmlFor="event-reminder-time"
          className="block text-sm font-medium"
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
          className="mt-2 w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 disabled:opacity-50"
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

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Reminder times are calculated from the
          event start time. Notifications appear
          in the CampusConnect bell.
        </p>
      </div>
    </div>
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
        className="rounded-xl border border-gray-300 p-6 dark:border-gray-700"
      >
        <h2
          id="save-event-heading"
          className="text-xl font-semibold"
        >
          Save This Event
        </h2>

        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          This event cannot currently be saved.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="save-event-heading"
      className="rounded-xl border border-gray-300 p-6 dark:border-gray-700"
    >
      <h2
        id="save-event-heading"
        className="text-xl font-semibold"
      >
        {saved ? "Saved Event" : "Save This Event"}
      </h2>

      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {saved
          ? "This event is in your saved events. You can change your reminder settings without removing it."
          : "Save this event and choose whether to receive an in-app reminder."}
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
                ? "text-sm text-green-600 dark:text-green-400"
                : "text-sm text-red-600 dark:text-red-400"
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
          className="mt-5 border-t border-gray-300 pt-5 dark:border-gray-700"
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
