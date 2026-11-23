import { AppShell } from "@/components/AppShell";

const skeleton = "animate-pulse rounded-md bg-[var(--maroon-100)]";

export default function Loading() {
  return (
    <AppShell>
      <main className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-7 px-4 py-7 sm:px-6 sm:py-9 lg:px-10" aria-busy="true" aria-label="Loading campus feed">
        <header className="space-y-3" aria-hidden="true">
          <div className={`${skeleton} h-4 w-28`} />
          <div className={`${skeleton} h-8 w-64 max-w-full`} />
          <div className={`${skeleton} h-4 w-80 max-w-full`} />
        </header>
        <section className="space-y-5" aria-hidden="true">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={`${skeleton} h-7 w-36`} />
            <div className="flex gap-2"><div className={`${skeleton} h-11 w-28`} /><div className={`${skeleton} h-11 w-28`} /></div>
          </div>
          <div className={`${skeleton} h-11 w-full`} />
          <div className="flex flex-wrap gap-3 rounded-xl border border-[var(--border)] p-4">
            <div className={`${skeleton} h-11 min-w-36 flex-1`} />
            <div className={`${skeleton} h-11 min-w-32 flex-1`} />
            <div className={`${skeleton} h-11 w-32`} />
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6].map((key) => (
            <div key={key} className="space-y-4 rounded-xl border border-[var(--border)] p-5">
              <div className="flex items-center justify-between gap-3"><div className={`${skeleton} h-6 w-24`} /><div className={`${skeleton} h-4 w-20`} /></div>
              <div className={`${skeleton} h-6 w-4/5`} />
              <div className="space-y-2"><div className={`${skeleton} h-4 w-full`} /><div className={`${skeleton} h-4 w-11/12`} /><div className={`${skeleton} h-4 w-2/3`} /></div>
              <div className="flex gap-4 pt-5"><div className={`${skeleton} h-4 w-20`} /><div className={`${skeleton} h-4 w-24`} /></div>
            </div>
          ))}
        </section>
        <p className="sr-only" role="status">Loading campus feed...</p>
      </main>
    </AppShell>
  );
}
