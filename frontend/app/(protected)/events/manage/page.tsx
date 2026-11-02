
import Link from "next/link";
import { createEventServerClient } from "@/modules/events/server";

type ManagedEvent = {
  id: string;
  title: string;
  location: string;
  starts_at: string;
  status: string;
  revision: number;
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Beirut",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ManageEventsPage() {
  const supabase = await createEventServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">My Events</h1>
        <p className="mt-4">
          Please sign in to manage your events.
        </p>
      </main>
    );
  }

  const { data: canManage, error: permissionError } =
    await supabase.rpc("can_manage_events");

  if (permissionError || canManage !== true) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">My Events</h1>
        <p className="mt-4 text-gray-600">
          Your account does not have permission to
          manage events.
        </p>
      </main>
    );
  }

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, location, starts_at, status, revision",
    )
    .eq("organizer_id", user.id)
    .order("starts_at", { ascending: false })
    .limit(100);

  const events = (data ?? []) as ManagedEvent[];

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My Events</h1>

          <p className="mt-2 text-gray-600">
            Manage your campus events and drafts.
          </p>
        </div>

        <Link
          href="/events/new"
          className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white"
        >
          Create Event
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-red-600">
          Could not load your events.
        </p>
      )}

      {!error && events.length === 0 && (
        <div className="rounded-xl border p-8 text-center">
          <h2 className="text-lg font-semibold">
            No events yet
          </h2>

          <p className="mt-2 text-gray-600">
            Your created events will appear here.
          </p>

          <Link
            href="/events/new"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            Create your first event
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {events.map((event) => (
          <article
            key={event.id}
            className="rounded-xl border p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {event.title}
                </h2>

                <p className="mt-2 text-sm text-gray-600">
                  {formatEventDate(event.starts_at)}
                </p>

                <p className="mt-1 text-sm text-gray-600">
                  {event.location}
                </p>

                <p className="mt-3 text-sm">
                  Status:{" "}
                  <span className="font-semibold capitalize">
                    {event.status}
                  </span>
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Revision {event.revision}
                </p>
              </div>

              {event.status !== "cancelled" ? (
                <Link
                  href={`/events/${event.id}/edit`}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Edit Event
                </Link>
              ) : (
                <span className="text-sm text-gray-500">
                  Cancelled
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
