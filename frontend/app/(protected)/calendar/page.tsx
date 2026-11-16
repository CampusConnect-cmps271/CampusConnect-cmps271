import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import { beirutToday, CalendarView, loadCalendarView, parseCalendarParams } from "@/modules/planner";

export const metadata: Metadata = {
  title: "Calendar · CampusConnect",
};

type CalendarPageProps = {
  searchParams: Promise<{ view?: string | string[]; date?: string | string[] }>;
};

/** SCRUM-244: Today and This Week, from ?view=today|week&date=YYYY-MM-DD. */
export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  await requireUser();
  const { view, date } = parseCalendarParams(await searchParams, beirutToday());
  const model = await loadCalendarView({ view, date });
  // error.tsx offers a retry.
  if (!model) throw new Error("The calendar could not be loaded.");

  return (
    <AppShell>
      <main className="flex-1 bg-white px-4 py-6 sm:py-10">
        <CalendarView model={model} />
      </main>
    </AppShell>
  );
}
