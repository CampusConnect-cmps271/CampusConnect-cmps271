
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getEventDetail,
  type EventDetail,
} from "@/modules/events/detail";
import EventSaveControls from "@/modules/events/EventSaveControls";
import { EventGoingControl } from "@/modules/planner";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Beirut",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(new Date(value));
}

function safeRegistrationUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      /\s/.test(value)
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function EventStatus({
  status,
}: {
  status: EventDetail["status"];
}) {
  const styles = {
    published:
      "border-green-500 text-green-700 dark:text-green-400",
    draft:
      "border-yellow-500 text-yellow-700 dark:text-yellow-400",
    cancelled:
      "border-red-400 text-red-600 dark:text-red-400",
  };

  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-sm font-semibold ${styles[status]}`}
    >
      {status === "published"
        ? "Published"
        : status === "draft"
          ? "Draft"
          : "Cancelled"}
    </span>
  );
}

function EventInformation({
  event,
}: {
  event: EventDetail;
}) {
  const information = [
    {
      label: "Start Date and Time",
      value: formatEventDate(event.starts_at),
    },
    {
      label: "End Date and Time",
      value: formatEventDate(event.ends_at),
    },
    {
      label: "Timezone",
      value: event.timezone,
    },
    {
      label: "Location",
      value: event.location,
    },
    {
      label: "Category",
      value: event.category,
    },
    {
      label: "Organizer",
      value: event.organizer_display_name,
    },
  ];

  return (
    <section
      aria-labelledby="event-information-heading"
      className="rounded-xl border border-gray-300 p-6 dark:border-gray-700"
    >
      <h2
        id="event-information-heading"
        className="text-xl font-semibold"
      >
        Event Information
      </h2>

      <dl className="mt-5 grid gap-5 sm:grid-cols-2">
        {information.map((item) => (
          <div key={item.label}>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {item.label}
            </dt>
            <dd className="mt-1 font-medium">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {event.club_name && (
        <div className="mt-5 border-t border-gray-300 pt-4 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Club or Organization
          </p>
          <p className="mt-1 font-medium">
            {event.club_name}
          </p>
        </div>
      )}
    </section>
  );
}

function RegistrationSection({
  event,
}: {
  event: EventDetail;
}) {
  const registrationUrl = safeRegistrationUrl(
    event.registration_url,
  );

  return (
    <section
      aria-labelledby="registration-heading"
      className="rounded-xl border border-gray-300 p-6 dark:border-gray-700"
    >
      <h2
        id="registration-heading"
        className="text-xl font-semibold"
      >
        Registration
      </h2>

      {event.status === "cancelled" ? (
        <p className="mt-4 text-red-600 dark:text-red-400">
          This event has been cancelled. Registration
          is no longer available through this page.
        </p>
      ) : event.status === "draft" ? (
        <p className="mt-4 text-gray-600 dark:text-gray-300">
          This event is still a draft. Registration
          information is not publicly available.
        </p>
      ) : registrationUrl ? (
        <>
          <p className="mt-4 text-gray-600 dark:text-gray-300">
            Registration for this event is handled
            through an external website.
          </p>

          <a
            href={registrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Open Registration Website
            <span className="ml-2" aria-hidden="true">
              ↗
            </span>
          </a>

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Opens an external website in a new tab.
            CampusConnect does not process event
            registrations.
          </p>
        </>
      ) : (
        <p className="mt-4 text-gray-600 dark:text-gray-300">
          No online registration link has been
          provided for this event. Contact the
          organizer if you need more information.
        </p>
      )}

      {event.status === "published" && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          CampusConnect displays event information
          but does not confirm registration,
          availability, or requirements. Check with
          the organizer before attending.
        </p>
      )}
    </section>
  );
}

async function SavedEventSection({
  event,
}: {
  event: EventDetail;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("saved_events")
    .select(
      "event_id, reminder_enabled, reminder_minutes_before",
    )
    .eq("student_id", user.id)
    .eq("event_id", event.id)
    .maybeSingle();

  if (error) {
    return (
      <section
        role="alert"
        className="rounded-xl border border-red-400 p-6"
      >
        <h2 className="text-xl font-semibold">
          Save This Event
        </h2>
        <p className="mt-3">
          Saved event preferences are temporarily
          unavailable. Please reload the page.
        </p>
      </section>
    );
  }

  return (
    <EventSaveControls
      key={event.id}
      eventId={event.id}
      initiallySaved={Boolean(data)}
      initiallyEnabled={
        data?.reminder_enabled ?? true
      }
      initiallyMinutes={
        data?.reminder_minutes_before ?? 60
      }
      canSave={event.status === "published"}
    />
  );
}

export default async function EventDetailsPage({
  params,
}: PageProps) {
  const { id } = await params;
  const result = await getEventDetail(id);

  if (!result.success) {
    if (
      result.reason === "invalid_id" ||
      result.reason === "not_found"
    ) {
      notFound();
    }

    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <section
          role="alert"
          className="rounded-xl border border-red-300 p-6"
        >
          <h1 className="text-2xl font-bold">
            {result.reason === "unauthenticated"
              ? "Sign In Required"
              : "Could Not Load Event"}
          </h1>

          <p className="mt-3">
            {result.message}
          </p>

          <Link
            href="/events"
            className="mt-5 inline-block text-blue-600 hover:underline dark:text-blue-400"
          >
            Back to Events
          </Link>
        </section>
      </main>
    );
  }

  const event = result.event;
  const cancelled = event.status === "cancelled";

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <nav aria-label="Breadcrumb">
        <Link
          href="/events"
          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Back to Campus Events
        </Link>
      </nav>

      <header className="mt-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <EventStatus status={event.status} />

          <span className="text-sm text-gray-500 dark:text-gray-400">
            {event.category}
          </span>
        </div>

        <h1 className="text-3xl font-bold sm:text-4xl">
          {event.title}
        </h1>

        <p className="mt-4 text-gray-600 dark:text-gray-300">
          Organized by{" "}
          <span className="font-semibold">
            {event.organizer_display_name}
          </span>
        </p>

        {event.is_owner && (
          <Link
            href={`/events/${event.id}/edit`}
            className="mt-5 inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Manage This Event
          </Link>
        )}
      </header>

      {cancelled && (
        <section
          role="status"
          aria-label="Event cancellation notice"
          className="mt-8 rounded-xl border border-red-400 p-6"
        >
          <h2 className="text-xl font-semibold text-red-600 dark:text-red-400">
            Event Cancelled
          </h2>

          <p className="mt-3">
            This event has been cancelled by its
            organizer. The information below is
            retained for reference only.
          </p>
        </section>
      )}

      <div className="mt-8 space-y-6">
        <section
          aria-labelledby="event-description-heading"
          className="rounded-xl border border-gray-300 p-6 dark:border-gray-700"
        >
          <h2
            id="event-description-heading"
            className="text-xl font-semibold"
          >
            About This Event
          </h2>

          <div className="mt-4 whitespace-pre-wrap leading-7 text-gray-700 dark:text-gray-300">
            {event.description ||
              "No detailed description has been provided."}
          </div>
        </section>

        <EventInformation event={event} />

        <SavedEventSection event={event} />

        <EventGoingControl eventId={event.id} />

        <RegistrationSection event={event} />
      </div>

      <div className="mt-8">
        <Link
          href="/events"
          className="inline-block rounded-lg border border-gray-300 px-5 py-3 font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Back to All Events
        </Link>
      </div>
    </main>
  );
}
