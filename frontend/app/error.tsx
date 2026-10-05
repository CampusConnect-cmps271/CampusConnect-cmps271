"use client";

import { useEffect } from "react";
import { reportClientError } from "@/modules/logging/client";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("frontend.error.boundary", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <section className="w-full max-w-lg rounded-xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-3 text-gray-600">
          The error was recorded so the team can investigate it.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
