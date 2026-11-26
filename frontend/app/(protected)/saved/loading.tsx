import { AppShell } from "@/components/AppShell";

export default function Loading() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6" aria-busy="true">
        <div className="mb-8 h-5 w-32 animate-pulse rounded bg-[var(--maroon-100)]" />
        <div className="mb-6 h-8 w-44 animate-pulse rounded-lg bg-[var(--maroon-100)]" />
        <ul className="space-y-4" aria-label="Loading saved posts">
          {[1, 2, 3].map((item) => (
            <li key={item} className="animate-pulse rounded-xl border border-[var(--border)] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="h-6 w-24 rounded-full bg-[var(--maroon-100)]" />
                <div className="h-4 w-20 rounded bg-[var(--maroon-100)]" />
              </div>
              <div className="mb-3 h-6 w-3/4 rounded bg-[var(--maroon-100)]" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-[var(--maroon-100)]" />
                <div className="h-4 w-2/3 rounded bg-[var(--maroon-100)]" />
              </div>
            </li>
          ))}
        </ul>
        <p className="sr-only" role="status">
          Loading saved posts...
        </p>
      </main>
    </AppShell>
  );
}
