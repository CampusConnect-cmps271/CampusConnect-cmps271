import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { getMyPlan, parsePlannerSearch, PlanView, searchCoursesForPlan } from "@/modules/planner";

export const metadata: Metadata = {
  title: "Semester plan · CampusConnect",
};

type PlanPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function PlanPage({ params, searchParams }: PlanPageProps) {
  await requireUser();
  const { id } = await params;

  // Unknown ids and other students' plans (hidden by RLS) are both 404s.
  const plan = await getMyPlan(id);
  if (!plan) notFound();

  const query = parsePlannerSearch((await searchParams).q);
  const results = await searchCoursesForPlan(query);

  return (
    <AppShell>
<main className="flex-1 bg-white px-4 py-6 sm:py-10">
      <PlanView plan={plan} query={query} results={results} />
    </main>
</AppShell>
  );
}
