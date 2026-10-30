
"use client";

import Link from "next/link";
import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function EventsError({
  error,
  reset,
}: Props) {
  useEffect(() => {
    console.error("Events page failed:", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <section
        role="alert"
        className="rounded-xl border border-red-300 p-8"
      >
        <h1 className="text-2xl font-bold">
          Events Could Not Be Loaded
        </h1>

        <p className="mt-3 text-gray-600 dark:text-gray-300">
          Something went wrong while loading the
          events page. You can try again or return
          to the home page.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            Try Again
          </button>

          <Link
            href="/"
            className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium dark:border-gray-600"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}
