
import Link from "next/link";
import { notFound } from "next/navigation";

import EventEditForm from "@/modules/events/EventEditForm";
import { createEventServerClient } from "@/modules/events/server";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

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
  organizer_id: string;
};

export default async function EditEventPage({
  params,
}: PageProps) {
  const { id } = await params;

  const supabase = await createEventServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: canManage, error: permissionError } =
    await supabase.rpc("can_manage_events");

  if (permissionError || canManage !== true) {
    notFound();
  }

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, organizer_id, title, description, starts_at, ends_at, timezone, location, category, status, registration_url, club_name, revision",
    )
    .eq("id", id)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const event = data as EditableEvent;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/events/manage"
        className="text-sm text-blue-600 hover:underline"
      >
        Back to My Events
      </Link>

      <div className="my-8">
        <h1 className="text-3xl font-bold">
          Edit Event
        </h1>

        <p className="mt-3 text-gray-600">
          Update your event information or cancel the
          event.
        </p>

        <p className="mt-2 text-sm text-gray-500">
          Current status:{" "}
          <span className="font-semibold capitalize">
            {event.status}
          </span>
        </p>
      </div>

      <EventEditForm event={event} />
    </main>
  );
}
