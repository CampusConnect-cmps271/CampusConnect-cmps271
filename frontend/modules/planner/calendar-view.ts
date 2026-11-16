import { addDays, formatWeekRange, mondayOf, parseCalendarDate, weekDates } from "./calendar";
import type { CalendarDataEntry } from "./calendar-data";
import { formatTermDate } from "./terms";
import { timeFromMinutes } from "./time";

/**
 * The /calendar page's Today and This Week views (SCRUM-244) and their
 * overlap warnings (SCRUM-245), built from getCalendarData's entries. Pure:
 * the current time comes in as an argument, and every date and time is read
 * in Asia/Beirut whatever the machine's zone.
 */

export type CalendarViewMode = "today" | "week";

/** What getCalendarData returns: the entries, the plans it read, and what the student has at all. */
export type CalendarData = {
  entries: CalendarDataEntry[];
  /** The student's plans near the range, with their term dates. */
  plans: { id: string; term: string; starts_on: string; ends_on: string }[];
  /** How many plans and saved events the student has in total, for the empty state. */
  totals: { plans: number; savedEvents: number };
};

/** The view and date from the URL; anything else falls back to today's day view. */
export function parseCalendarParams(search: { view?: unknown; date?: unknown }, today: string): { view: CalendarViewMode; date: string } {
  const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
  const view = first(search.view) === "week" ? "week" : "today";
  return { view, date: parseCalendarDate(first(search.date)) ?? today };
}

/** The Beirut dates a view shows: the day, or Monday to Sunday (the planner's week). */
export function calendarRangeFor(view: CalendarViewMode, date: string): { from: string; to: string } {
  if (view === "today") return { from: date, to: date };
  const monday = mondayOf(date);
  return { from: monday, to: addDays(monday, 6) };
}

export const calendarHref = (view: CalendarViewMode, date: string) => `/calendar?view=${view}&date=${date}`;

// ---------------------------------------------------------------------------
// Overlaps

/** Things the student has committed to: classes, their own timed items, and events they are going to. */
function committed(entry: CalendarDataEntry): boolean {
  if (!entry.starts_at || !entry.ends_at || entry.all_day_date) return false;
  if (entry.kind === "class" || entry.kind === "item") return true;
  return entry.kind === "event" && entry.going === true && entry.cancelled !== true;
}

/** A saved event the student hasn't said they're going to. It may clash, but never warns. */
function savedOnly(entry: CalendarDataEntry): boolean {
  return entry.kind === "event" && entry.going !== true && entry.cancelled !== true && Boolean(entry.starts_at && entry.ends_at);
}

/** The overlap of two entries as half-open intervals [start, end): touching ends don't overlap. */
function overlapOf(a: CalendarDataEntry, b: CalendarDataEntry): { start: number; end: number } | null {
  const start = Math.max(Date.parse(a.starts_at!), Date.parse(b.starts_at!));
  const end = Math.min(Date.parse(a.ends_at!), Date.parse(b.ends_at!));
  return start < end ? { start, end } : null;
}

export type CalendarOverlap = {
  key: string;
  first: CalendarDataEntry;
  second: CalendarDataEntry;
  /** ISO instants of the overlapping stretch. */
  starts_at: string;
  ends_at: string;
};

/**
 * Overlaps among what the student has committed to, and, for saved events
 * they aren't going to, which of those they clash with. All-day items,
 * reminders and cancelled events never clash. Same half-open rule as the
 * planner's conflict engine.
 */
export function calendarOverlaps(entries: readonly CalendarDataEntry[]): {
  overlaps: CalendarOverlap[];
  /** Saved-only event id → the titles of what it clashes with. */
  clashes: Map<string, string[]>;
} {
  const sure = entries.filter(committed);
  const overlaps: CalendarOverlap[] = [];
  for (let i = 0; i < sure.length; i += 1) {
    for (let j = i + 1; j < sure.length; j += 1) {
      const window = overlapOf(sure[i], sure[j]);
      if (!window) continue;
      const [first, second] = [sure[i], sure[j]].sort(
        (a, b) => a.starts_at!.localeCompare(b.starts_at!) || a.title.localeCompare(b.title),
      );
      overlaps.push({
        key: `${first.id}|${second.id}`,
        first,
        second,
        starts_at: new Date(window.start).toISOString(),
        ends_at: new Date(window.end).toISOString(),
      });
    }
  }
  overlaps.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.key.localeCompare(b.key));

  const clashes = new Map<string, string[]>();
  for (const event of entries.filter(savedOnly)) {
    const titles = [...new Set(sure.filter((entry) => overlapOf(event, entry)).map((entry) => entry.title))];
    if (titles.length) clashes.set(event.id, titles);
  }
  return { overlaps, clashes };
}

// ---------------------------------------------------------------------------
// Beirut wall clock

const BEIRUT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Beirut",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A moment's Beirut date (YYYY-MM-DD) and minute of the day. */
export function beirutClock(at: Date | number | string): { date: string; minute: number } {
  const parts = Object.fromEntries(BEIRUT.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

const clock = (at: string) => timeFromMinutes(beirutClock(at).minute);

/** "Tue, 16 Feb 2027, 11:00–11:15", or both ends in full when it runs past midnight. */
export function overlapWhen(overlap: Pick<CalendarOverlap, "starts_at" | "ends_at">): string {
  const start = beirutClock(overlap.starts_at);
  const end = beirutClock(overlap.ends_at);
  if (start.date === end.date || (end.minute === 0 && addDays(start.date, 1) === end.date)) {
    return `${formatTermDate(start.date)}, ${timeFromMinutes(start.minute)}–${timeFromMinutes(end.date === start.date ? end.minute : 1440)}`;
  }
  return `${formatTermDate(start.date)} ${timeFromMinutes(start.minute)} to ${formatTermDate(end.date)} ${timeFromMinutes(end.minute)}`;
}

// ---------------------------------------------------------------------------
// The view

export type ViewEntryKind = "class" | "item" | "event" | "saved" | "cancelled" | "reminder";

/** One entry as shown on one day. */
export type ViewEntry = {
  id: string;
  kind: ViewEntryKind;
  /** "CMPS 202", "Quiz", "Career fair", "Reminder: Career fair at 17:00". */
  title: string;
  /** Its kind in words: "Class", "Your item", "Event (going)", "Event (saved)", "Event (cancelled)", "Reminder". */
  kindLabel: string;
  /** Section, type, room; the course of an item; an event's place. */
  details: string[];
  href: string;
  date: string;
  /** This day's stretch in Beirut minutes; null when all day. A reminder starts and ends at its moment. */
  start_minute: number | null;
  end_minute: number | null;
  /** "09:00–09:50", "All day", "17:00". */
  time: string;
  /** Part of an overlap warning. */
  overlap: boolean;
  /** For a saved-only event: "Clashes with CMPS 202". */
  note: string | null;
};

export type CalendarDay = { date: string; heading: string; today: boolean; entries: ViewEntry[] };

export type OverlapLine = {
  key: string;
  first: { title: string; kindLabel: string; href: string };
  second: { title: string; kindLabel: string; href: string };
  when: string;
};

export type CalendarViewModel = {
  view: CalendarViewMode;
  date: string;
  today: string;
  from: string;
  to: string;
  /** "Tue, 16 Feb 2027" or "15–21 Feb 2027". */
  rangeLabel: string;
  nav: {
    previous: { href: string; label: string; name: string };
    current: { href: string; label: string; here: boolean };
    next: { href: string; label: string; name: string };
  };
  switcher: { today: string; week: string };
  days: CalendarDay[];
  overlaps: OverlapLine[];
  /** On today's view of today: the next thing still ahead. */
  next: { title: string; time: string } | null;
  /** On today's date: the minute it is now in Beirut, for the "Now" line. */
  nowMinute: number | null;
  /** No plan's term reaches the dates shown: classes can't be on it. */
  noPlanCovers: boolean;
  /** "nothing": no plans and no saved events at all; "range": nothing in the dates shown. */
  empty: "nothing" | "range" | null;
  counts: { classes: number; items: number; events: number; reminders: number; overlaps: number; clashes: number };
};

function kindOf(entry: CalendarDataEntry): ViewEntryKind {
  if (entry.kind === "event") return entry.cancelled ? "cancelled" : entry.going ? "event" : "saved";
  return entry.kind;
}

export const KIND_LABEL: Record<ViewEntryKind, string> = {
  class: "Class",
  item: "Your item",
  event: "Event (going)",
  saved: "Event (saved)",
  cancelled: "Event (cancelled)",
  reminder: "Reminder",
};

function detailsOf(entry: CalendarDataEntry): string[] {
  if (entry.kind === "class") {
    return [
      entry.section ? `Section ${entry.section}` : null,
      entry.class_type ?? null,
      entry.location ?? null,
      entry.source === "manual" ? "Typed by you, tentative" : null,
    ].filter((part): part is string => Boolean(part));
  }
  if (entry.kind === "item") return entry.course_code ? [entry.course_code] : [];
  if (entry.kind === "event") return entry.location ? [entry.location] : [];
  return [];
}

function titleOf(entry: CalendarDataEntry): string {
  if (entry.kind === "reminder" && entry.event_starts_at) return `${entry.title} at ${clock(entry.event_starts_at)}`;
  return entry.title;
}

const listJoin = (names: readonly string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** Builds the Today or This Week view for `date`, with `now` for the Now line and what's next. */
export function buildCalendarView({
  view,
  date,
  today,
  now,
  data,
}: {
  view: CalendarViewMode;
  date: string;
  today: string;
  now: Date;
  data: CalendarData;
}): CalendarViewModel {
  const { from, to } = calendarRangeFor(view, date);
  const dates = view === "today" ? [date] : weekDates(from);
  const inRange = (day: string) => day >= from && day <= to;
  const shown = data.entries.filter((entry) =>
    entry.all_day_date ? inRange(entry.all_day_date) : entry.slices.some((slice) => inRange(slice.date)),
  );

  const { overlaps, clashes } = calendarOverlaps(shown);
  const inView = overlaps.filter((overlap) => {
    const start = beirutClock(overlap.starts_at).date;
    const end = beirutClock(new Date(Date.parse(overlap.ends_at) - 1)).date;
    return start <= to && end >= from;
  });
  const overlapping = new Set(inView.flatMap((overlap) => [overlap.first.id, overlap.second.id]));

  const days: CalendarDay[] = dates.map((day) => ({ date: day, heading: formatTermDate(day), today: day === today, entries: [] }));
  for (const entry of shown) {
    const kind = kindOf(entry);
    const base = {
      id: entry.id,
      kind,
      title: titleOf(entry),
      kindLabel: KIND_LABEL[kind],
      details: detailsOf(entry),
      href: entry.href,
      overlap: overlapping.has(entry.id),
      note: clashes.has(entry.id) ? `Clashes with ${listJoin(clashes.get(entry.id)!)}` : null,
    };
    if (entry.all_day_date) {
      days.find((day) => day.date === entry.all_day_date)?.entries.push({
        ...base,
        date: entry.all_day_date,
        start_minute: null,
        end_minute: null,
        time: "All day",
      });
      continue;
    }
    for (const slice of entry.slices) {
      const day = days.find((candidate) => candidate.date === slice.date);
      if (!day) continue;
      day.entries.push({
        ...base,
        date: slice.date,
        start_minute: slice.start_minute,
        end_minute: slice.end_minute,
        time:
          kind === "reminder"
            ? timeFromMinutes(slice.start_minute)
            : `${timeFromMinutes(slice.start_minute)}–${timeFromMinutes(slice.end_minute)}`,
      });
    }
  }
  for (const day of days) {
    day.entries.sort(
      (a, b) =>
        (a.start_minute ?? -1) - (b.start_minute ?? -1) ||
        (a.end_minute ?? -1) - (b.end_minute ?? -1) ||
        a.title.localeCompare(b.title),
    );
  }

  const nowClock = beirutClock(now);
  const showsToday = dates.includes(nowClock.date);
  const ahead =
    view === "today" && date === nowClock.date
      ? shown
          .filter((entry) => entry.kind !== "reminder" && !entry.cancelled && entry.starts_at && Date.parse(entry.starts_at) > now.getTime())
          .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))[0]
      : undefined;

  const monday = mondayOf(date);
  const nav =
    view === "today"
      ? {
          previous: { href: calendarHref("today", addDays(date, -1)), label: "← Previous day", name: `Previous day, ${formatTermDate(addDays(date, -1))}` },
          current: { href: calendarHref("today", today), label: "Today", here: date === today },
          next: { href: calendarHref("today", addDays(date, 1)), label: "Next day →", name: `Next day, ${formatTermDate(addDays(date, 1))}` },
        }
      : {
          previous: { href: calendarHref("week", addDays(monday, -7)), label: "← Previous week", name: `Previous week, ${formatWeekRange(addDays(monday, -7))}` },
          current: { href: calendarHref("week", mondayOf(today)), label: "This week", here: monday === mondayOf(today) },
          next: { href: calendarHref("week", addDays(monday, 7)), label: "Next week →", name: `Next week, ${formatWeekRange(addDays(monday, 7))}` },
        };

  const count = (kind: CalendarDataEntry["kind"]) => shown.filter((entry) => entry.kind === kind).length;
  const clashesInView = shown.filter((entry) => clashes.has(entry.id)).length;

  return {
    view,
    date,
    today,
    from,
    to,
    rangeLabel: view === "today" ? formatTermDate(date) : formatWeekRange(monday),
    nav,
    switcher: { today: calendarHref("today", view === "week" && inRange(today) ? today : date), week: calendarHref("week", date) },
    days,
    overlaps: inView.map((overlap) => ({
      key: overlap.key,
      first: { title: titleOf(overlap.first), kindLabel: KIND_LABEL[kindOf(overlap.first)], href: overlap.first.href },
      second: { title: titleOf(overlap.second), kindLabel: KIND_LABEL[kindOf(overlap.second)], href: overlap.second.href },
      when: overlapWhen(overlap),
    })),
    next: ahead ? { title: titleOf(ahead), time: clock(ahead.starts_at!) } : null,
    nowMinute: showsToday ? nowClock.minute : null,
    noPlanCovers: !data.plans.some((plan) => plan.starts_on <= to && plan.ends_on >= from),
    empty: data.totals.plans === 0 && data.totals.savedEvents === 0 ? "nothing" : shown.length === 0 ? "range" : null,
    counts: {
      classes: count("class"),
      items: count("item"),
      events: count("event"),
      reminders: count("reminder"),
      overlaps: inView.length,
      clashes: clashesInView,
    },
  };
}
