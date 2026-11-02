
import Link from "next/link";
import EventCreateForm from "@/modules/events/EventCreateForm";

export default function NewEventPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/"
        className="text-sm text-blue-600 hover:underline"
      >
        Back to Home
      </Link>

      <div className="my-8">
        <h1 className="text-3xl font-bold">
          Create an Event
        </h1>

        <p className="mt-3 text-gray-600">
          Share an upcoming campus event with students.
          Save your event as a draft or publish it.
        </p>
      </div>

      <EventCreateForm />
    </main>
  );
}
