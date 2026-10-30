
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createEventAction } from "./actions";
import {
  EVENT_CATEGORIES,
  initialEventState,
  type EventField,
  type EventFormErrors,
} from "./validation";

function SubmitButtons() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="submit"
        name="intent"
        value="draft"
        disabled={pending}
        className="rounded-lg border px-5 py-3 font-medium disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save Draft"}
      </button>

      <button
        type="submit"
        name="intent"
        value="published"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving..." : "Publish Event"}
      </button>
    </div>
  );
}

function FieldError({
  name,
  errors,
}: {
  name: EventField;
  errors: EventFormErrors;
}) {
  if (!errors[name]) return null;

  return (
    <p className="mt-1 text-sm text-red-600" role="alert">
      {errors[name]}
    </p>
  );
}

const inputClass =
  "mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-gray-900";

export default function EventCreateForm() {
  const [state, formAction] = useActionState(
    createEventAction,
    initialEventState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label
          htmlFor="event-title"
          className="block font-medium"
        >
          Event Title *
        </label>

        <input
          id="event-title"
          name="title"
          maxLength={200}
          className={inputClass}
          placeholder="Example: Coding Workshop"
          aria-invalid={Boolean(state.errors.title)}
          required
        />

        <FieldError name="title" errors={state.errors} />
      </div>

      <div>
        <label
          htmlFor="event-description"
          className="block font-medium"
        >
          Description
        </label>

        <textarea
          id="event-description"
          name="description"
          maxLength={10000}
          rows={6}
          className={inputClass}
          placeholder="Describe what students can expect..."
          aria-invalid={Boolean(state.errors.description)}
        />

        <FieldError
          name="description"
          errors={state.errors}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label
            htmlFor="event-start"
            className="block font-medium"
          >
            Start Date and Time *
          </label>

          <input
            id="event-start"
            name="startsAt"
            type="datetime-local"
            step={60}
            className={inputClass}
            aria-invalid={Boolean(state.errors.startsAt)}
            required
          />

          <FieldError
            name="startsAt"
            errors={state.errors}
          />
        </div>

        <div>
          <label
            htmlFor="event-end"
            className="block font-medium"
          >
            End Date and Time *
          </label>

          <input
            id="event-end"
            name="endsAt"
            type="datetime-local"
            step={60}
            className={inputClass}
            aria-invalid={Boolean(state.errors.endsAt)}
            required
          />

          <FieldError
            name="endsAt"
            errors={state.errors}
          />
        </div>
      </div>

      <p className="text-sm text-gray-500">
        All event times are entered in Asia/Beirut time.
      </p>

      <div>
        <label
          htmlFor="event-location"
          className="block font-medium"
        >
          Location *
        </label>

        <input
          id="event-location"
          name="location"
          maxLength={300}
          className={inputClass}
          placeholder="Example: AUB, West Hall"
          aria-invalid={Boolean(state.errors.location)}
          required
        />

        <FieldError
          name="location"
          errors={state.errors}
        />
      </div>

      <div>
        <label
          htmlFor="event-category"
          className="block font-medium"
        >
          Category *
        </label>

        <select
          id="event-category"
          name="category"
          defaultValue=""
          className={inputClass}
          aria-invalid={Boolean(state.errors.category)}
          required
        >
          <option value="" disabled>
            Select a category
          </option>

          {EVENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <FieldError
          name="category"
          errors={state.errors}
        />
      </div>

      <div>
        <label
          htmlFor="event-club"
          className="block font-medium"
        >
          Club or Organizer Name (Optional)
        </label>

        <input
          id="event-club"
          name="clubName"
          maxLength={150}
          className={inputClass}
          placeholder="Example: AUB Computer Science Club"
          aria-invalid={Boolean(state.errors.clubName)}
        />

        <FieldError
          name="clubName"
          errors={state.errors}
        />
      </div>

      <div>
        <label
          htmlFor="event-registration"
          className="block font-medium"
        >
          Registration URL (Optional)
        </label>

        <input
          id="event-registration"
          name="registrationUrl"
          type="url"
          maxLength={2048}
          className={inputClass}
          placeholder="https://example.com/register"
          aria-invalid={Boolean(
            state.errors.registrationUrl,
          )}
        />

        <FieldError
          name="registrationUrl"
          errors={state.errors}
        />
      </div>

      {state.message && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.message}
        </p>
      )}

      <SubmitButtons />
    </form>
  );
}
