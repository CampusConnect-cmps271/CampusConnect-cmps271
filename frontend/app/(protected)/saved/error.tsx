"use client";

import Link from "next/link";
import { useEffect } from "react";
import { logClient } from "@/modules/logging/client";

type SavedErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function SavedError({ error, retry }: SavedErrorProps) {
  useEffect(() => {
    logClient("saved.page.render_failure", { digest: error.digest ?? null });
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <section role="alert" className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-6 text-center">
        <h1 className="text-xl font-bold text-[var(--ink)]">Your saved posts couldn&apos;t be loaded</h1>
        <p className="text-sm text-[var(--ink-soft)]">This is usually temporary. Your saved posts are safe.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="min-h-11 rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
          >
            Try again
          </button>
          <Link
            href="/home"
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
