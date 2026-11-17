import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import { availableTerms, beirutToday, listMyPlans, NewPlanForm, PlanList } from "@/modules/planner";

export const metadata: Metadata = {
  title: "Semester planner · CampusConnect",
};

export default async function PlannerPage() {
  await requireUser();
  const plans = await listMyPlans();
  const terms = availableTerms(
    plans.map((plan) => plan.term),
    beirutToday(),
  );

  return (
    <AppShell>
      <main className="flex-1 bg-white px-4 py-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <h1 className="text-2xl font-bold text-[var(--ink)]">Semester planner</h1>

          <section aria-labelledby="my-plans-heading" className="flex flex-col gap-3">
            <h2 id="my-plans-heading" className="text-lg font-semibold text-[var(--ink)]">
              My plans
            </h2>
            <PlanList plans={plans} />
          </section>

          <section aria-labelledby="new-plan-heading" className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4">
            <h2 id="new-plan-heading" className="text-lg font-semibold text-[var(--ink)]">
              New plan
            </h2>
            <NewPlanForm terms={terms} />
          </section>
        </div>
      </main>
    </AppShell>
  );
}
