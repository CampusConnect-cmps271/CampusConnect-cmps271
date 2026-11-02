
"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  updateEventAction,
  cancelEventAction,
} from "./management";

import {
  EVENT_CATEGORIES,
  type EventField,
  type EventFormErrors,
} from "./validation";

type EditableEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  category: string;
  status: string;
  registration_url: string | null;
  club_name: string | null;
  revision: number;
};

type Props = {
  event: EditableEvent;
};

const inputStyle =
  "mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-gray-900";

function formatBeirutInput(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return (
    `${part("year")}-${part("month")}-${part("day")}` +
    `T${part("hour")}:${part("minute")}`
  );
}

function FormError({
  name,
  errors,
}: {
  name: EventField;
  errors: EventFormErrors;
}) {
  if (!errors[name]) return null;

  return (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {errors[name]}
    </p>
  );
}

function SaveButtons({
  status,
}: {
  status: string;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap gap-3">
      {status === "draft" && (
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={pending}
          className="rounded-lg border px-5 py-3 font-medium disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save Changes"}
        </button>
      )}

      <button
        type="submit"
        name="intent"
        value="published"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {pending
          ? "Saving..."
          : status === "draft"
            ? "Publish Event"
            : "Save Changes"}
      </button>
    </div>
  );
}

function CancelButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-500 px-5 py-3 font-medium text-red-600 disabled:opacity-50"
    >
      {pending ? "Cancelling..." : "Cancel Event"}
    </button>
  );
}

export default function EventEditForm({
  event,
}: Props) {
  const router = useRouter();

  const [updateState, updateAction] = useActionState(
    updateEventAction,
    {
      success: false,
      message: "",
      errors: {},
    },
  );

  const [cancelState, cancelAction] = useActionState(
    cancelEventAction,
    {
      success: false,
      message: "",
      errors: {},
    },
  );

  const currentRevision =
    cancelState.revision ??
    updateState.revision ??
    event.revision;

  const isCancelled =
    cancelState.success ||
    event.status === "cancelled";

  useEffect(() => {
    if (updateState.success || cancelState.success) {
      router.refresh();
    }
  }, [
    updateState.success,
    updateState.revision,
    cancelState.success,
    router,
  ]);

  const categories = EVENT_CATEGORIES.includes(
    event.category as (typeof EVENT_CATEGORIES)[number],
  )
    ? [...EVENT_CATEGORIES]
    : [...EVENT_CATEGORIES, event.category];

  return (
    <div className="space-y-8">
      {isCancelled ? (
        <div
          role="status"
          className="rounded-lg border border-gray-300 p-5"
        >
          <h2 className="text-lg font-semibold">
            Event Cancelled
          </h2>

          <p className="mt-2 text-gray-600">
            This event has been cancelled and can no
            longer be edited or published.
          </p>

          <Link
            href="/events/manage"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            Return to My Events
          </Link>
        </div>
      ) : (
        <>
          <form
            action={updateAction}
            className="space-y-6"
          >
            <input
              type="hidden"
              name="eventId"
              value={event.id}
            />

            <input
              type="hidden"
              name="revision"
              value={currentRevision}
            />

            <div>
              <label
                htmlFor="edit-title"
                className="block font-medium"
              >
                Event Title *
              </label>

              <input
                id="edit-title"
                name="title"
                defaultValue={event.title}
                maxLength={200}
                required
                className={inputStyle}
              />

              <FormError
                name="title"
                errors={updateState.errors}
              />
            </div>

            <div>
              <label
                htmlFor="edit-description"
                className="block font-medium"
              >
                Description
              </label>

              <textarea
                id="edit-description"
                name="description"
                defaultValue={event.description}
                rows={6}
                maxLength={10000}
                className={inputStyle}
              />

              <FormError
                name="description"
                errors={updateState.errors}
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="edit-start"
                  className="block font-medium"
                >
                  Start Date and Time *
                </label>

                <input
                  id="edit-start"
                  name="startsAt"
                  type="datetime-local"
                  step={60}
                  defaultValue={formatBeirutInput(
                    event.starts_at,
                  )}
                  required
                  className={inputStyle}
                />

                <FormError
                  name="startsAt"
                  errors={updateState.errors}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-end"
                  className="block font-medium"
                >
                  End Date and Time *
                </label>

                <input
                  id="edit-end"
                  name="endsAt"
                  type="datetime-local"
                  step={60}
                  defaultValue={formatBeirutInput(
                    event.ends_at,
                  )}
                  required
                  className={inputStyle}
                />

                <FormError
                  name="endsAt"
                  errors={updateState.errors}
                />
              </div>
            </div>

            <p className="text-sm text-gray-500">
              Times are shown in Asia/Beirut.
            </p>

            <div>
              <label
                htmlFor="edit-location"
                className="block font-medium"
              >
                Location *
              </label>

              <input
                id="edit-location"
                name="location"
                defaultValue={event.location}
                maxLength={300}
                required
                className={inputStyle}
              />

              <FormError
                name="location"
                errors={updateState.errors}
              />
            </div>

            <div>
              <label
                htmlFor="edit-category"
                className="block font-medium"
              >
                Category *
              </label>

              <select
                id="edit-category"
                name="category"
                defaultValue={event.category}
                required
                className={inputStyle}
              >
                {categories.map((category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                ))}
              </select>

              <FormError
                name="category"
                errors={updateState.errors}
              />
            </div>

            <div>
              <label
                htmlFor="edit-club"
                className="block font-medium"
              >
                Club or Organizer Name (Optional)
              </label>

              <input
                id="edit-club"
                name="clubName"
                defaultValue={event.club_name ?? ""}
                maxLength={150}
                className={inputStyle}
              />

              <FormError
                name="clubName"
                errors={updateState.errors}
              />
            </div>

            <div>
              <label
                htmlFor="edit-registration"
                className="block font-medium"
              >
                Registration URL (Optional)
              </label>

              <input
                id="edit-registration"
                name="registrationUrl"
                type="url"
                defaultValue={
                  event.registration_url ?? ""
                }
                maxLength={2048}
                className={inputStyle}
              />

              <FormError
                name="registrationUrl"
                errors={updateState.errors}
              />
            </div>

            {updateState.message && (
              <p
                role="status"
                className={
                  updateState.success
                    ? "text-green-700"
                    : "text-red-600"
                }
              >
                {updateState.message}
              </p>
            )}

            <SaveButtons status={event.status} />
          </form>

          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold">
              Cancel This Event
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              Cancellation is permanent. The event
              record will be retained, but it cannot
              be edited or restored afterward.
            </p>

            <form
              action={cancelAction}
              onSubmit={(e) => {
                const confirmed = window.confirm(
                  "Are you sure you want to cancel this event? This cannot be undone.",
                );

                if (!confirmed) {
                  e.preventDefault();
                }
              }}
              className="mt-4"
            >
              <input
                type="hidden"
                name="eventId"
                value={event.id}
              />

              <input
                type="hidden"
                name="revision"
                value={currentRevision}
              />

              <CancelButton />
            </form>

            {cancelState.message && (
              <p
                role="status"
                className={
                  cancelState.success
                    ? "mt-3 text-green-700"
                    : "mt-3 text-red-600"
                }
              >
                {cancelState.message}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
