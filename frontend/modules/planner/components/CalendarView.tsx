import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CalendarEntry } from "../calendar";
import type { CalendarDay, CalendarViewModel, ViewEntry } from "../calendar-view";
import { timeFromMinutes } from "../time";
import { CalendarKindIcon } from "./CalendarKindIcon";
import { KIND_STYLE, WeekGrid } from "./CalendarWeek";

const LINK = "font-semibold text-[var(--maroon)] underline";
const NAV_LINK =
  "rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)] hover:text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";
const TAB = "rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

/** The calendar's grid entry for a view entry: its kind and overlap flag, with the kind also in words. */
function gridEntry(entry: ViewEntry): CalendarEntry {
  const suffix = entry.kind === "saved" ? " (saved)" : entry.kind === "cancelled" ? " (cancelled)" : "";
  return {
    key: `${entry.id}:${entry.date}`,
    kind: entry.kind,
    label: `${entry.title}${suffix}`,
    detail: entry.details[0],
    href: entry.href,
    date: entry.date,
    start_minute: entry.start_minute,
    end_minute: entry.end_minute,
    conflict: entry.overlap,
  };
}

/** One entry in a day's list: time, title (linked), kind in words and as an icon, details, and any warning. */
function EntryRow({ entry }: { entry: ViewEntry }) {
  const cancelled = entry.kind === "cancelled";
  return (
    <li
      className={`flex gap-2 rounded-md border-l-4 px-3 py-2 text-sm text-[var(--ink)] ${
        entry.overlap ? "border-[var(--danger)] bg-[#fdecea]" : KIND_STYLE[entry.kind].replace("line-through", "")
      }`}
    >
      <CalendarKindIcon kind={entry.kind} />
      <div className="min-w-0">
        <p>
          <span className="font-medium tabular-nums">{entry.time}</span>{" "}
          <a href={entry.href} className={`${LINK} ${cancelled ? "line-through" : ""}`}>
            {entry.title}
          </a>
          <span className="text-[var(--ink-soft)]"> · {entry.kindLabel}</span>
          {entry.details.map((detail) => (
            <span key={detail} className="text-[var(--ink-soft)]">
              {" "}
              · {detail}
            </span>
          ))}
        </p>
        {entry.overlap ? (
          <p className="font-semibold text-[var(--danger)]">
            <span aria-hidden="true">⚠ </span>Overlaps something else
          </p>
        ) : null}
        {entry.note ? <p className="text-xs text-[var(--ink-soft)]">{entry.note}</p> : null}
      </div>
    </li>
  );
}

/** A day's entries, all-day ones first, with a "Now" line at the current time when `nowMinute` is set. */
function DayList({ day, nowMinute, label }: { day: CalendarDay; nowMinute: number | null; label: string }) {
  const nowAt = nowMinute === null ? -1 : day.entries.findIndex((entry) => entry.start_minute !== null && entry.start_minute > nowMinute);
  const rows = day.entries.map((entry) => <EntryRow key={`${entry.id}:${entry.date}`} entry={entry} />);
  if (nowMinute !== null) {
    const now = (
      <li key="now" className="flex items-center gap-2 text-xs font-semibold text-[var(--danger)]" aria-label={`Now, ${timeFromMinutes(nowMinute)}`}>
        <span aria-hidden="true" className="h-0.5 flex-1 bg-[var(--danger)]" />
        <span aria-hidden="true">Now · {timeFromMinutes(nowMinute)}</span>
        <span aria-hidden="true" className="h-0.5 flex-1 bg-[var(--danger)]" />
      </li>
    );
    rows.splice(nowAt === -1 ? rows.length : nowAt, 0, now);
  }
  return (
    <ol aria-label={label} className="flex flex-col gap-2">
      {rows}
    </ol>
  );
}

/**
 * The /calendar page (SCRUM-244/245): one Beirut day or Monday to Sunday,
 * with classes from the plan covering each day, the student's own items,
 * saved events and reminders, and the overlaps among what they've committed
 * to. Everything is in Asia/Beirut.
 */
export function CalendarView({ model }: { model: CalendarViewModel }) {
  const { view, nav } = model;
  const span = view === "today" ? (model.date === model.today ? "today" : "this day") : "this week";
  const overlapCount = model.overlaps.length;
  const headline = overlapCount
    ? `${overlapCount} ${overlapCount === 1 ? "overlap" : "overlaps"} ${span}`
    : `No overlaps ${span}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-[var(--ink)]">Calendar</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Your classes, your own items, saved events and reminders. All times are Beirut time.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Calendar view" className="flex gap-1 rounded-lg border border-[var(--border)] bg-white p-1">
          <Link
            href={model.switcher.today}
            aria-current={view === "today" ? "page" : undefined}
            className={`${TAB} ${view === "today" ? "bg-[var(--maroon)] text-white" : "text-[var(--ink)] hover:bg-[var(--maroon-50)]"}`}
          >
            Day
          </Link>
          <Link
            href={model.switcher.week}
            aria-current={view === "week" ? "page" : undefined}
            className={`${TAB} ${view === "week" ? "bg-[var(--maroon)] text-white" : "text-[var(--ink)] hover:bg-[var(--maroon-50)]"}`}
          >
            Week
          </Link>
        </nav>
        <nav aria-label={view === "today" ? "Days" : "Weeks"} className="flex flex-wrap gap-2">
          <Link href={nav.previous.href} aria-label={nav.previous.name} className={NAV_LINK}>
            {nav.previous.label}
          </Link>
          <Link href={nav.current.href} aria-current={nav.current.here ? "date" : undefined} className={NAV_LINK}>
            {nav.current.label}
          </Link>
          <Link href={nav.next.href} aria-label={nav.next.name} className={NAV_LINK}>
            {nav.next.label}
          </Link>
        </nav>
      </div>

      <section aria-labelledby="calendar-range-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="calendar-range-heading" className="text-lg font-semibold text-[var(--ink)]">
            {model.rangeLabel}
            {view === "today" && model.date === model.today ? " (today)" : ""}
          </h2>
          {model.next ? (
            <p className="text-sm text-[var(--ink)]">
              Next: <strong>{model.next.title}</strong> at {model.next.time}
            </p>
          ) : null}
        </div>

        <div
          aria-live="polite"
          className={`flex gap-3 rounded-lg border-2 px-4 py-3 ${
            overlapCount ? "border-[var(--danger)] bg-[#fdecea]" : "border-[var(--border)] bg-white"
          }`}
        >
          {overlapCount ? (
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" />
          ) : (
            <CircleCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ink-soft)]" />
          )}
          <div className="flex min-w-0 flex-col gap-2 text-sm text-[var(--ink)]">
            <h3 className="text-base font-semibold">{headline}</h3>
            {overlapCount ? (
              <ul aria-label="Overlaps" className="flex list-disc flex-col gap-1 pl-5">
                {model.overlaps.map((overlap) => (
                  <li key={overlap.key}>
                    <a href={overlap.first.href} className={LINK}>
                      {overlap.first.title}
                    </a>{" "}
                    ({overlap.first.kind}) and{" "}
                    <a href={overlap.second.href} className={LINK}>
                      {overlap.second.title}
                    </a>{" "}
                    ({overlap.second.kind}) overlap on {overlap.when} (Beirut time).
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--ink-soft)]">Counting classes, your timed items and events you&apos;re going to.</p>
            )}
          </div>
        </div>

        {model.noPlanCovers && model.empty !== "nothing" ? (
          <p className="rounded-lg border border-[#b26a00] bg-[#fff6e5] px-4 py-3 text-sm text-[var(--ink)]">
            No semester plan covers {view === "today" ? "this day" : "this week"}.{" "}
            <Link href="/planner" className={LINK}>
              Plan your classes
            </Link>
          </p>
        ) : null}

        {model.empty === "nothing" ? (
          <p className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--ink)]">
            You have no semester plans or saved events yet.{" "}
            <Link href="/planner" className={LINK}>
              Plan a semester
            </Link>{" "}
            or{" "}
            <Link href="/events" className={LINK}>
              find events to save
            </Link>
            .
          </p>
        ) : model.empty === "range" ? (
          <p className="text-sm text-[var(--ink-soft)]">Nothing on your calendar {span}.</p>
        ) : null}

        {view === "today" ? (
          model.days[0].entries.length || model.nowMinute !== null ? (
            <DayList day={model.days[0]} nowMinute={model.nowMinute} label={`Your day, ${model.rangeLabel}`} />
          ) : null
        ) : model.empty ? null : (
          <>
            <WeekGrid
              dates={model.days.map((day) => day.date)}
              days={model.days.map((day) => day.entries.map(gridEntry))}
              today={model.today}
            />
            <ol aria-label={`Your week, ${model.rangeLabel}`} className="flex flex-col gap-4 sm:sr-only">
              {model.days.map((day) => (
                <li key={day.date} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-[var(--ink)]">
                    {day.heading}
                    {day.today ? " (today)" : ""}
                  </h3>
                  {day.entries.length ? (
                    <DayList day={day} nowMinute={null} label={day.heading} />
                  ) : (
                    <p className="text-sm text-[var(--ink-soft)]">Nothing this day.</p>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
