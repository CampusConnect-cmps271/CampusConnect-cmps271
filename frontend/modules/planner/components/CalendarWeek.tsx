import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addDays, classWeekLabel, formatWeekRange, mondayOf, weekDates, type CalendarEntry, type CalendarEntryKind } from "../calendar";
import type { PlanDetails } from "../types";
import type { ItemCourseOption, ItemDateRange } from "./ItemForms";
import { CONFLICT_STYLE, KIND_NAME, KIND_STYLE } from "./styles";
import { WeekBoard } from "./WeekBoard";

type CalendarWeekProps = {
  plan: PlanDetails;
  /** The week's Monday. */
  monday: string;
  /** The first and last Mondays the calendar can show. */
  range: { first: string; last: string };
  /** Beirut's date today. */
  today: string;
  /** weekEntries: seven days, Monday first. */
  days: readonly CalendarEntry[][];
  courses: readonly ItemCourseOption[];
  dateRange: ItemDateRange;
};

const KINDS: readonly CalendarEntryKind[] = ["class", "item", "event"];

const NAV =
  "inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-white px-2.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)] hover:text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

/** The plan's calendar: the week's title and navigation, a key, and the week itself. */
export function CalendarWeek({ plan, monday, range, today, days, courses, dateRange }: CalendarWeekProps) {
  const thisWeek = mondayOf(today);
  const previous = addDays(monday, -7);
  const next = addDays(monday, 7);
  const href = (week: string) => `/planner/${plan.id}?week=${week}#calendar`;

  return (
    <section id="calendar" aria-labelledby="calendar-heading" className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 id="calendar-heading" className="text-xl font-bold text-[var(--ink)]">
            {formatWeekRange(monday)}
          </h2>
          <p className="text-sm text-[var(--ink-soft)]">{classWeekLabel(monday, plan)}</p>
        </div>
        <nav aria-label="Calendar weeks" className="flex items-center gap-1.5">
          {thisWeek !== monday && thisWeek >= range.first && thisWeek <= range.last ? (
            <Link href={href(thisWeek)} className={NAV}>
              This week
            </Link>
          ) : null}
          {previous >= range.first ? (
            <Link href={href(previous)} className={NAV} aria-label={`Previous week, ${formatWeekRange(previous)}`}>
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : null}
          {next <= range.last ? (
            <Link href={href(next)} className={NAV} aria-label={`Next week, ${formatWeekRange(next)}`}>
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : null}
        </nav>
      </div>

      <ul aria-label="Key" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-soft)]">
        {KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-3 w-3 rounded-sm border-l-[3px] ${KIND_STYLE[kind]}`} />
            {KIND_NAME[kind]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm border border-[var(--danger)]" style={CONFLICT_STYLE} />
          Overlap
        </li>
        <li className="hidden sm:block">Click a square to add an item.</li>
      </ul>

      <WeekBoard
        planId={plan.id}
        dates={weekDates(monday)}
        today={today}
        days={days}
        items={plan.items}
        courses={courses}
        dateRange={dateRange}
      />
    </section>
  );
}
