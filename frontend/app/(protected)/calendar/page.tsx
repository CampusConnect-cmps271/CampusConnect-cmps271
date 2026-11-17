import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { beirutToday, listMyPlans } from "@/modules/planner";

/**
 * The calendar now lives on each plan's page. Old links land on the plan
 * whose term covers today, else the next one, else the plan list.
 */
export default async function CalendarPage() {
  await requireUser();
  const today = beirutToday();
  const plans = await listMyPlans();
  const plan =
    plans.find((candidate) => candidate.starts_on <= today && today <= candidate.ends_on) ??
    plans.find((candidate) => candidate.starts_on > today);
  redirect(plan ? `/planner/${plan.id}` : "/planner");
}
