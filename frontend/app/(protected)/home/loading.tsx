
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="animate-pulse space-y-3">
        <div className="h-8 w-64 rounded-lg bg-[var(--maroon-100)]" />
        <div className="h-4 w-48 rounded-lg bg-[var(--maroon-100)]" />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-7 w-36 animate-pulse rounded-lg bg-[var(--maroon-100)]" />
          <div className="h-10 w-28 animate-pulse rounded-lg bg-[var(--maroon-100)]" />
        </div>

        <div className="flex gap-3">
          <div className="h-10 w-40 animate-pulse rounded-lg bg-[var(--maroon-100)]" />
          <div className="h-10 w-28 animate-pulse rounded-lg bg-[var(--maroon-100)]" />
        </div>
      </section>

      <section
        className="space-y-4"
        aria-label="Loading campus feed"
        aria-busy="true"
      >
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="animate-pulse rounded-xl border border-[var(--border)] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="h-6 w-24 rounded-full bg-[var(--maroon-100)]" />
              <div className="h-4 w-20 rounded bg-[var(--maroon-100)]" />
            </div>

            <div className="mb-3 h-6 w-3/4 rounded bg-[var(--maroon-100)]" />

            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-[var(--maroon-100)]" />
              <div className="h-4 w-5/6 rounded bg-[var(--maroon-100)]" />
              <div className="h-4 w-2/3 rounded bg-[var(--maroon-100)]" />
            </div>

            <div className="mt-5 flex gap-4">
              <div className="h-4 w-20 rounded bg-[var(--maroon-100)]" />
              <div className="h-4 w-24 rounded bg-[var(--maroon-100)]" />
            </div>
          </div>
        ))}
      </section>

      <p className="sr-only" role="status">
        Loading campus feed...
      </p>
    </main>
  );
}
