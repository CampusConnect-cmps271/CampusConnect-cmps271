import { AppShell } from "@/components/AppShell";

export default function PlannerLoading() {
  return (
    <AppShell>
<main className="flex-1 bg-white px-4 py-6 sm:py-10" role="status" aria-label="Loading your semester plans">
      <div className="mx-auto flex w-full max-w-3xl animate-pulse flex-col gap-4" aria-hidden="true">
        <div className="h-7 w-48 rounded bg-[var(--maroon-100)]" />
        <div className="h-16 rounded-lg bg-[var(--maroon-50)]" />
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 rounded-xl border border-[var(--border)]" />
        ))}
      </div>
    </main>
</AppShell>
  );
}
