import { AppShell } from "@/components/AppShell";

export default function CalendarLoading() {
  return (
    <AppShell>
      <main className="flex-1 bg-white px-4 py-6 sm:py-10" role="status" aria-label="Loading your calendar">
        <div className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-4" aria-hidden="true">
          <div className="h-7 w-40 rounded bg-[var(--maroon-100)]" />
          <div className="h-10 rounded-lg bg-[var(--maroon-50)]" />
          <div className="h-16 rounded-lg border border-[var(--border)]" />
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-12 rounded-md border border-[var(--border)]" />
          ))}
        </div>
      </main>
    </AppShell>
  );
}
