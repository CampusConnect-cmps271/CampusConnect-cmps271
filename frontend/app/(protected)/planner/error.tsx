"use client";

import Link from "next/link";
import { useEffect } from "react";
import { logClient } from "@/modules/logging/client";

type PlannerErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function PlannerError({ error, retry }: PlannerErrorProps) {
  useEffect(() => {
    logClient("planner.page.render_failure", { digest: error.digest ?? null });
  }, [error]);

  return (
    <main className="flex-1 bg-white px-4 py-10">
      <section role="alert" className="mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-[var(--border)] p-6 text-center">
        <h1 className="text-xl font-bold text-[var(--ink)]">Your plans couldn&apos;t be loaded</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          This is usually temporary. Your saved plans are safe.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)]"
          >
            Try again
          </button>
          <Link href="/home" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium">
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
