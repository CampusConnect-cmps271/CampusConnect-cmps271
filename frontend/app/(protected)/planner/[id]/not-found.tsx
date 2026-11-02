import { AppShell } from "@/components/AppShell";
import Link from "next/link";

export default function PlanNotFound() {
  return (
    <AppShell>
<main className="flex-1 bg-white px-4 py-10">
      <section className="mx-auto flex max-w-xl flex-col gap-3 text-center">
        <h1 className="text-2xl font-bold text-[var(--ink)]">Plan not found</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          This plan doesn&apos;t exist, or it belongs to another student. Plans are private.
        </p>
        <Link href="/planner" className="font-medium text-[var(--maroon)] hover:underline">
          Go to my plans
        </Link>
      </section>
    </main>
</AppShell>
  );
}
