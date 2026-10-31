import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import {
  beirutToday,
  checkPlanConflicts,
  getMyPlan,
  listSavedEventsNear,
  parsePlannerSearch,
  planCalendar,
  PlanView,
  searchCoursesForPlan,
} from "@/modules/planner";

export const metadata: Metadata = {
  title: "Semester plan · CampusConnect",
};

type PlanPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[]; week?: string | string[] }>;
};

export default async function PlanPage({ params, searchParams }: PlanPageProps) {
  await requireUser();
  const { id } = await params;

  // Unknown ids and other students' plans (hidden by RLS) are both 404s.
  const plan = await getMyPlan(id);
  if (!plan) notFound();

  const search = await searchParams;
  const [events, results] = await Promise.all([
    listSavedEventsNear(plan),
    searchCoursesForPlan(parsePlannerSearch(search.q)),
  ]);

  // Checked on every render, so after every action, against the saved plan.
  const report = checkPlanConflicts(plan, events ?? []);
  const calendar = planCalendar({ plan, events: events ?? [], report, week: search.week, today: beirutToday() });

  return (
    <AppShell>
<main className="flex-1 bg-white px-4 py-6 sm:py-10">
      <PlanView
        plan={plan}
        report={report}
        query={parsePlannerSearch(search.q)}
        results={results}
        events={events}
        calendar={calendar}
      />
    </main>
</AppShell>
  );
}
