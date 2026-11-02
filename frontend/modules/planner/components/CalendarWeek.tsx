import Link from "next/link";
import {
  addDays,
  classWeekLabel,
  formatWeekRange,
  mondayOf,
  weekDates,
  type CalendarEntry,
  type CalendarEntryKind,
} from "../calendar";
import { formatTermDate } from "../terms";
import { timeFromMinutes, WEEKDAYS } from "../time";
import type { PlanDetails } from "../types";

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
};

type Block = CalendarEntry & { start: number; end: number; lane: number; lanes: number };

const HOUR_REM = 2.5;

const KIND_NAME: Record<CalendarEntryKind, string> = { class: "Class", item: "Your item", event: "Event" };

const KIND_STYLE: Record<CalendarEntryKind, string> = {
  class: "border-[var(--maroon-200)] bg-[var(--maroon-50)]",
  item: "border-[#b26a00] bg-[#fff6e5]",
  event: "border-[#2f6f8f] bg-[#e7f2f7]",
};

const CONFLICT_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #fdecea 0 4px, #f8c9c4 4px 8px)",
};

const NAV_LINK =
  "rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)] hover:text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

/** Side-by-side lanes for blocks that overlap within one day. */
function assignLanes(entries: readonly CalendarEntry[]): Block[] {
  const laneEnds: number[] = [];
  const placed = entries
    .filter((entry) => entry.start_minute !== null && entry.end_minute !== null)
    .map((entry) => ({ ...entry, start: entry.start_minute ?? 0, end: entry.end_minute ?? 0 }))
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((block) => {
      let lane = laneEnds.findIndex((end) => end <= block.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = block.end;
      return { ...block, lane, lanes: 0 };
    });
  return placed.map((block) => ({ ...block, lanes: laneEnds.length }));
}

const times = (entry: CalendarEntry) =>
  entry.start_minute === null || entry.end_minute === null
    ? "All day"
    : `${timeFromMinutes(entry.start_minute)}–${timeFromMinutes(entry.end_minute)}`;

/**
 * One week of the plan's calendar in Beirut time: class meetings, the
 * student's own items and the events they are going to. A grid on wider
 * screens, hidden from assistive technology; the day-by-day list below it
 * carries the same entries and is what phones show.
 */
export function CalendarWeek({ plan, monday, range, today, days }: CalendarWeekProps) {
  const dates = weekDates(monday);
  const thisWeek = mondayOf(today);
  const previous = addDays(monday, -7);
  const next = addDays(monday, 7);
  const href = (week: string) => `/planner/${plan.id}?week=${week}#calendar`;
  const empty = days.every((entries) => entries.length === 0);

  return (
    <section id="calendar" aria-labelledby="calendar-heading" className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="calendar-heading" className="text-lg font-semibold text-[var(--ink)]">
            Calendar
          </h2>
          <p className="text-sm text-[var(--ink-soft)]">
            <span className="font-semibold text-[var(--ink)]">{formatWeekRange(monday)}</span> · {classWeekLabel(monday, plan)}
          </p>
        </div>
        <nav aria-label="Calendar weeks" className="flex flex-wrap gap-2">
          {previous >= range.first ? (
            <Link href={href(previous)} className={NAV_LINK} aria-label={`Previous week, ${formatWeekRange(previous)}`}>
              ← Previous
            </Link>
          ) : null}
          {thisWeek !== monday && thisWeek >= range.first && thisWeek <= range.last ? (
            <Link href={href(thisWeek)} className={NAV_LINK}>
              This week
            </Link>
          ) : null}
          {next <= range.last ? (
            <Link href={href(next)} className={NAV_LINK} aria-label={`Next week, ${formatWeekRange(next)}`}>
              Next →
            </Link>
          ) : null}
        </nav>
      </div>

      <ul aria-label="Key" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-soft)]">
        {(Object.keys(KIND_NAME) as CalendarEntryKind[]).map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-3 w-3 rounded-sm border ${KIND_STYLE[kind]}`} />
            {KIND_NAME[kind]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm border-2 border-[var(--danger)]" style={CONFLICT_STYLE} />
          Overlap ⚠
        </li>
      </ul>

      {empty ? <p className="text-sm text-[var(--ink-soft)]">Nothing on your calendar this week.</p> : null}

      <WeekGrid dates={dates} days={days} today={today} />

      <ol aria-label={`Your week, ${formatWeekRange(monday)}`} className="flex flex-col gap-3 sm:sr-only">
        {dates.map((date, index) =>
          days[index].length ? (
            <li key={date} className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                {formatTermDate(date)}
                {date === today ? " (today)" : ""}
              </h3>
              <ul className="flex flex-col gap-1">
                {days[index].map((entry) => (
                  <li
                    key={entry.key}
                    className={`rounded-md border-l-4 px-3 py-1.5 text-sm text-[var(--ink)] ${entry.conflict ? "border-[var(--danger)] bg-[#fdecea]" : KIND_STYLE[entry.kind]}`}
                  >
                    <span className="font-medium">{times(entry)}</span>{" "}
                    <a href={entry.href} className="font-semibold text-[var(--maroon)] underline">
                      {entry.label}
                    </a>
                    {entry.detail ? ` · ${entry.detail}` : ""} · {KIND_NAME[entry.kind]}
                    {entry.conflict ? (
                      <span className="font-semibold text-[var(--danger)]">
                        {" "}
                        · <span aria-hidden="true">⚠ </span>Overlaps something else
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ) : null,
        )}
      </ol>
    </section>
  );
}

/** The week as a time grid. Its links are for the mouse; the list above serves the keyboard and screen readers. */
function WeekGrid({ dates, days, today }: { dates: readonly string[]; days: readonly CalendarEntry[][]; today: string }) {
  const blocks = days.map(assignLanes);
  const timed = blocks.flat();
  const first = Math.min(8 * 60, ...timed.map((block) => Math.floor(block.start / 60) * 60));
  const last = Math.max(18 * 60, ...timed.map((block) => Math.ceil(block.end / 60) * 60));
  const hours = Array.from({ length: (last - first) / 60 }, (_, index) => first + index * 60);
  const height = `${hours.length * HOUR_REM}rem`;
  const percent = (minute: number) => `${((minute - first) / (last - first)) * 100}%`;
  const allDay = days.map((entries) => entries.filter((entry) => entry.start_minute === null));
  const hasAllDay = allDay.some((entries) => entries.length > 0);

  return (
    <div aria-hidden="true" className="hidden overflow-x-auto rounded-lg border border-[var(--border)] bg-white sm:block">
      <div className="grid min-w-[560px] grid-cols-[3rem_repeat(7,minmax(0,1fr))] text-xs text-[var(--ink)]">
        <div />
        {dates.map((date, index) => (
          <div
            key={date}
            className={`border-b border-l border-[var(--border)] py-1 text-center ${date === today ? "bg-[var(--maroon-50)] font-bold text-[var(--maroon)]" : "font-semibold"}`}
          >
            {WEEKDAYS[index].short} {Number(date.slice(8))}
          </div>
        ))}

        {hasAllDay ? (
          <>
            <div className="border-b border-[var(--border)] pr-1 pt-1 text-right text-[10px] text-[var(--ink-soft)]">all day</div>
            {allDay.map((entries, index) => (
              <div key={dates[index]} className="flex flex-col gap-0.5 border-b border-l border-[var(--border)] p-0.5">
                {entries.map((entry) => (
                  <a key={entry.key} href={entry.href} tabIndex={-1} className={`truncate rounded border px-1 ${KIND_STYLE[entry.kind]}`}>
                    {entry.label}
                  </a>
                ))}
              </div>
            ))}
          </>
        ) : null}

        <div className="relative" style={{ height }}>
          {hours.map((hour) => (
            <span key={hour} className="absolute right-1 -translate-y-1/2 text-[10px] text-[var(--ink-soft)]" style={{ top: percent(hour) }}>
              {hour === first ? "" : timeFromMinutes(hour)}
            </span>
          ))}
        </div>
        {dates.map((date, index) => (
          <div
            key={date}
            className={`relative border-l border-[var(--border)] ${date === today ? "bg-[var(--maroon-50)]" : ""}`}
            style={{ height }}
          >
            {hours.slice(1).map((hour) => (
              <div key={hour} className="absolute inset-x-0 border-t border-dashed border-[var(--border)]" style={{ top: percent(hour) }} />
            ))}
            {blocks[index].map((block) => (
              <a
                key={block.key}
                href={block.href}
                tabIndex={-1}
                title={`${times(block)} ${block.label}`}
                className={`absolute overflow-hidden rounded border px-1 leading-tight hover:z-10 hover:shadow ${
                  block.conflict ? "border-2 border-[var(--danger)] font-semibold" : KIND_STYLE[block.kind]
                }`}
                style={{
                  top: percent(block.start),
                  height: `calc(${percent(block.end)} - ${percent(block.start)})`,
                  left: `${(block.lane / block.lanes) * 100}%`,
                  width: `${100 / block.lanes}%`,
                  ...(block.conflict ? CONFLICT_STYLE : {}),
                }}
              >
                {block.conflict ? "⚠ " : ""}
                {block.label}
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
