"use client";

import { Plus, TriangleAlert } from "lucide-react";
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import type { CalendarEntry } from "../calendar";
import { formatTermDate } from "../terms";
import { timeFromMinutes, WEEKDAYS } from "../time";
import type { PlanItem } from "../types";
import { CONFLICT_STYLE, KIND_NAME, KIND_STYLE } from "./styles";
import { ItemDialog, type ItemCourseOption, type ItemDateRange, type ItemDialogTarget } from "./ItemForms";

type WeekBoardProps = {
  planId: string;
  /** The week's seven dates, Monday first. */
  dates: readonly string[];
  /** Beirut's date today. */
  today: string;
  /** weekEntries: seven days, Monday first. */
  days: readonly CalendarEntry[][];
  items: readonly PlanItem[];
  courses: readonly ItemCourseOption[];
  dateRange: ItemDateRange;
};

type Block = CalendarEntry & { start: number; end: number; lane: number; lanes: number };

const HOUR_REM = 3;
/** The grid always shows at least 08:00 to 21:00, stretched to fit what's on it. */
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const FREE_STRIP = "14px";

const CONFLICT_CLASS = "border-[var(--danger)] text-[var(--danger)]";

/** Side-by-side lanes for blocks that overlap within one day. */
function assignLanes(entries: readonly CalendarEntry[]): Block[] {
  const laneEnds: number[] = [];
  const placed = entries
    .filter((entry) => entry.start_minute !== null && entry.end_minute !== null)
    .map((entry) => {
      const start = entry.start_minute ?? 0;
      return { ...entry, start, end: Math.max(entry.end_minute ?? 0, start + 1) };
    })
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

/** "MATH 202, Tue, 16 Feb 2027, 11:00–12:15, class, overlaps something else". */
const entryName = (entry: CalendarEntry) =>
  [entry.label, formatTermDate(entry.date), times(entry), KIND_NAME[entry.kind].toLowerCase(), entry.conflict ? "overlaps something else" : ""]
    .filter(Boolean)
    .join(", ");

/**
 * The plan's week: a time grid on wider screens, a day-by-day list on
 * phones. Clicking an empty square (or a day's +) adds an item there;
 * clicking an item opens it. Classes link to their course, events to their
 * row in the sidebar.
 */
export function WeekBoard({ planId, dates, today, days, items, courses, dateRange }: WeekBoardProps) {
  const [target, setTarget] = useState<ItemDialogTarget | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const open = (next: ItemDialogTarget) => {
    setOpenCount((count) => count + 1);
    setTarget(next);
  };
  const addAt = (date: string, start: number | null) => open({ mode: "add", date, start });
  const edit = (itemId: string | undefined) => {
    const item = itemId ? itemsById.get(itemId) : undefined;
    if (item) open({ mode: "edit", item });
  };
  const usable = (date: string) => date >= dateRange.first && date <= dateRange.last;

  return (
    <>
      <WeekGrid dates={dates} today={today} days={days} usable={usable} onAdd={addAt} onEdit={edit} />
      <WeekList dates={dates} today={today} days={days} usable={usable} onAdd={addAt} onEdit={edit} />
      <ItemDialog
        target={target}
        openCount={openCount}
        onClose={() => setTarget(null)}
        planId={planId}
        courses={courses}
        dateRange={dateRange}
      />
    </>
  );
}

type ViewProps = {
  dates: readonly string[];
  today: string;
  days: readonly CalendarEntry[][];
  usable: (date: string) => boolean;
  onAdd: (date: string, start: number | null) => void;
  onEdit: (itemId: string | undefined) => void;
};

function EntryControl({ entry, onEdit, className, style, children }: {
  entry: CalendarEntry;
  onEdit: ViewProps["onEdit"];
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (entry.kind === "item") {
    return (
      <button type="button" onClick={() => onEdit(entry.item_id)} aria-label={`Edit ${entryName(entry)}`} className={className} style={style}>
        {children}
      </button>
    );
  }
  return (
    <a href={entry.href} aria-label={entryName(entry)} className={className} style={style}>
      {children}
    </a>
  );
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--maroon)]";

function WeekGrid({ dates, today, days, usable, onAdd, onEdit }: ViewProps) {
  const blocks = days.map(assignLanes);
  const timed = blocks.flat();
  const first = Math.min(DAY_START, ...timed.map((block) => Math.floor(block.start / 60) * 60));
  const last = Math.max(DAY_END, ...timed.map((block) => Math.ceil(block.end / 60) * 60));
  const hours = Array.from({ length: (last - first) / 60 }, (_, index) => first + index * 60);
  const height = `${hours.length * HOUR_REM}rem`;
  const percent = (minute: number) => `${((minute - first) / (last - first)) * 100}%`;
  const allDay = days.map((entries) => entries.filter((entry) => entry.start_minute === null));

  /** The half hour under the pointer within an hour's square. */
  const clickHour = (event: MouseEvent<HTMLButtonElement>, date: string, hour: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    onAdd(date, hour + (event.clientY - box.top >= box.height / 2 ? 30 : 0));
  };

  return (
    <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)] sm:block">
      <div className="grid min-w-[640px] grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] text-xs text-[var(--ink)]">
        <div className="border-b border-[var(--border)]" />
        {dates.map((date, index) => {
          const isToday = date === today;
          return (
            <div key={date} className="border-b border-l border-[var(--border)] p-1">
              <button
                type="button"
                disabled={!usable(date)}
                onClick={() => onAdd(date, null)}
                aria-label={`Add an item on ${formatTermDate(date)}`}
                className={`group flex w-full items-center justify-center gap-1.5 rounded-md py-1 hover:bg-[var(--maroon-50)] disabled:hover:bg-transparent ${FOCUS}`}
              >
                <span className={isToday ? "font-semibold text-[var(--maroon)]" : "font-semibold text-[var(--ink-soft)]"}>
                  {WEEKDAYS[index].short}
                </span>
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-bold ${
                    isToday ? "bg-[var(--maroon)] text-white" : "text-[var(--ink)]"
                  }`}
                >
                  {Number(date.slice(8))}
                </span>
                <Plus aria-hidden="true" className="h-3.5 w-3.5 text-[var(--maroon)] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
              </button>
            </div>
          );
        })}

        <div className="border-b border-[var(--border)] pr-1.5 pt-1.5 text-right text-[10px] text-[var(--ink-soft)]">all day</div>
        {allDay.map((entries, index) => {
          const date = dates[index];
          return (
            <div key={date} className="relative flex min-h-8 flex-col gap-0.5 border-b border-l border-[var(--border)] p-0.5">
              {usable(date) ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  data-slot={`${date}T`}
                  onClick={() => onAdd(date, null)}
                  className="absolute inset-0 cursor-cell hover:bg-[var(--maroon-50)]"
                />
              ) : null}
              {entries.map((entry) => (
                <EntryControl
                  key={entry.key}
                  entry={entry}
                  onEdit={onEdit}
                  className={`relative truncate rounded border-l-[3px] px-1.5 py-0.5 text-left font-medium ${KIND_STYLE[entry.kind]} ${FOCUS}`}
                >
                  {entry.label}
                </EntryControl>
              ))}
            </div>
          );
        })}

        <div className="relative" style={{ height }}>
          {hours.map((hour) => (
            <span
              key={hour}
              className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-[var(--ink-soft)]"
              style={{ top: percent(hour) }}
            >
              {hour === first ? "" : timeFromMinutes(hour)}
            </span>
          ))}
        </div>
        {dates.map((date, index) => (
          <div
            key={date}
            className={`relative border-l border-[var(--border)] ${date === today ? "bg-[var(--maroon-50)]/60" : ""}`}
            style={{ height }}
          >
            {hours.map((hour) => (
              <button
                key={hour}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                disabled={!usable(date)}
                data-slot={`${date}T${timeFromMinutes(hour)}`}
                onClick={(event) => clickHour(event, date, hour)}
                className="group absolute inset-x-0 flex items-start justify-end border-t border-[var(--border)] p-1 first:border-t-0 enabled:cursor-cell enabled:hover:bg-[var(--maroon-50)]"
                style={{ top: percent(hour), height: `${HOUR_REM}rem` }}
              >
                {usable(date) ? <Plus className="h-3.5 w-3.5 text-[var(--maroon)] opacity-0 group-hover:opacity-100" /> : null}
              </button>
            ))}
            {blocks[index].map((block) => {
              const short = block.end - block.start < 45;
              return (
                <EntryControl
                  key={block.key}
                  entry={block}
                  onEdit={onEdit}
                  className={`absolute z-10 flex flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left leading-tight shadow-sm hover:z-20 hover:shadow-md ${
                    block.conflict ? `border ${CONFLICT_CLASS}` : KIND_STYLE[block.kind]
                  } ${FOCUS}`}
                  style={{
                    top: percent(block.start),
                    height: `calc(${percent(block.end)} - ${percent(block.start)})`,
                    // A strip on the right stays free, so any time can be clicked.
                    left: `calc((100% - ${FREE_STRIP}) * ${block.lane / block.lanes} + 2px)`,
                    width: `calc((100% - ${FREE_STRIP}) / ${block.lanes} - 4px)`,
                    ...(block.conflict ? CONFLICT_STYLE : {}),
                  }}
                >
                  <span className="flex items-center gap-1 truncate font-semibold">
                    {block.conflict ? <TriangleAlert aria-hidden="true" className="h-3 w-3 shrink-0" /> : null}
                    <span className="truncate">{block.label}</span>
                  </span>
                  {short ? null : <span className="truncate text-[10px] tabular-nums opacity-80">{times(block)}</span>}
                </EntryControl>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekList({ dates, today, days, usable, onAdd, onEdit }: ViewProps) {
  return (
    <ol aria-label="Your week" className="flex flex-col gap-3 sm:hidden">
      {dates.map((date, index) => (
        <li key={date} className="flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-semibold ${date === today ? "text-[var(--maroon)]" : "text-[var(--ink)]"}`}>
              {formatTermDate(date)}
              {date === today ? " · today" : ""}
            </h3>
            {usable(date) ? (
              <button
                type="button"
                onClick={() => onAdd(date, null)}
                aria-label={`Add an item on ${formatTermDate(date)}`}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[var(--maroon)] hover:bg-[var(--maroon-50)] ${FOCUS}`}
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Add
              </button>
            ) : null}
          </div>
          {days[index].length ? (
            <ul className="flex flex-col gap-1">
              {days[index].map((entry) => (
                <li key={entry.key}>
                  <EntryControl
                    entry={entry}
                    onEdit={onEdit}
                    className={`flex w-full flex-wrap items-baseline gap-x-2 rounded-md border-l-[3px] px-2.5 py-1.5 text-left text-sm ${
                      entry.conflict ? `border ${CONFLICT_CLASS}` : KIND_STYLE[entry.kind]
                    } ${FOCUS}`}
                    style={entry.conflict ? CONFLICT_STYLE : undefined}
                  >
                    <span className="tabular-nums">{times(entry)}</span>
                    <span className="font-semibold">{entry.label}</span>
                    {entry.detail ? <span className="opacity-80">{entry.detail}</span> : null}
                    {entry.conflict ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold">
                        <TriangleAlert aria-hidden="true" className="h-3 w-3" /> Overlap
                      </span>
                    ) : null}
                  </EntryControl>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
