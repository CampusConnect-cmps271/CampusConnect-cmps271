import { calendarSlots, type CalendarSlot, type ConflictReport, type ConflictSide } from "./conflicts";
import { formatTermDate } from "./terms";
import { timeFromMinutes } from "./time";
import type { PlanDetails, PlannerEvent } from "./types";

/**
 * The plan page's week calendar: which week to show, and what is on it.
 * Pure date arithmetic on YYYY-MM-DD strings, read as UTC calendar days;
 * the times come from calendarSlots, already in Beirut.
 */

const DAY = 86_400_000;

/** Own items may fall this many days either side of the plan's classes, as planner_check_item allows. */
export const ITEM_WINDOW_DAYS = 30;

const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);
const format = (time: number) => new Date(time).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return format(parse(date) + days * DAY);
}

/** The Monday on or before a date. */
export function mondayOf(date: string): string {
  return addDays(date, -((new Date(parse(date)).getUTCDay() + 6) % 7));
}

/** A real calendar date as YYYY-MM-DD, else null. */
export function parseCalendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = parse(value);
  return Number.isNaN(time) || format(time) !== value ? null : value;
}

/** The dates the plan's own items may use. */
export function itemWindow(plan: Pick<PlanDetails, "starts_on" | "ends_on">): { first: string; last: string } {
  return { first: addDays(plan.starts_on, -ITEM_WINDOW_DAYS), last: addDays(plan.ends_on, ITEM_WINDOW_DAYS) };
}

/** The Mondays the calendar can show: the classes' weeks, stretched to reach anything on it. */
export function calendarRange(
  plan: Pick<PlanDetails, "starts_on" | "ends_on">,
  dates: readonly string[],
): { first: string; last: string } {
  const sorted = [plan.starts_on, plan.ends_on, ...dates].sort();
  return { first: mondayOf(sorted[0]), last: mondayOf(sorted[sorted.length - 1]) };
}

/**
 * The Monday to show: the requested week if it is in range, else this week
 * while the range includes it, else the first week of classes.
 */
export function pickWeek(
  requested: unknown,
  today: string,
  plan: Pick<PlanDetails, "starts_on">,
  range: { first: string; last: string },
): string {
  const asked = parseCalendarDate(Array.isArray(requested) ? requested[0] : requested);
  const inRange = (monday: string) => monday >= range.first && monday <= range.last;
  if (asked && inRange(mondayOf(asked))) return mondayOf(asked);
  if (inRange(mondayOf(today))) return mondayOf(today);
  return mondayOf(plan.starts_on);
}

/** The week's seven dates, Monday first. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** "Week 6 of classes", or where the week falls outside them. */
export function classWeekLabel(monday: string, plan: Pick<PlanDetails, "starts_on" | "ends_on">): string {
  const sunday = addDays(monday, 6);
  if (sunday < plan.starts_on) return "Before classes start";
  if (monday > plan.ends_on) return "After classes end";
  const weeks = Math.round((parse(monday) - parse(mondayOf(plan.starts_on))) / (7 * DAY)) + 1;
  return `Week ${weeks} of classes`;
}

const MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" });

/** "15–21 Feb 2027", "29 Mar – 4 Apr 2027" or "28 Dec 2026 – 3 Jan 2027". */
export function formatWeekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  const [startYear, , startDay] = monday.split("-").map(Number);
  const [endYear, , endDay] = sunday.split("-").map(Number);
  const startMonth = MONTH.format(parse(monday));
  const endMonth = MONTH.format(parse(sunday));
  if (startYear !== endYear) return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
  if (startMonth !== endMonth) return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
  return `${startDay}–${endDay} ${endMonth} ${endYear}`;
}

export type CalendarEntryKind = "class" | "item" | "event";

/** One thing on one day of the week view. */
export type CalendarEntry = {
  key: string;
  kind: CalendarEntryKind;
  label: string;
  /** The course an item belongs to, if any. */
  detail?: string;
  /** Where it is on the page (or the event's page). */
  href: string;
  date: string;
  /** Minutes after Beirut midnight; null for an all-day item. */
  start_minute: number | null;
  end_minute: number | null;
  /** Overlaps something else on this date. */
  conflict: boolean;
};

const sideKey = (side: ConflictSide) =>
  side.kind === "meeting" ? `meeting:${side.meeting_id}` : side.kind === "item" ? `item:${side.item_id}` : `event:${side.event_id}`;

/** What the week shows, day by day (Monday first), timed entries in start order after all-day ones. */
export function weekEntries({
  plan,
  events,
  slots,
  report,
  monday,
}: {
  plan: PlanDetails;
  events: readonly PlannerEvent[];
  slots: readonly CalendarSlot[];
  report: ConflictReport;
  monday: string;
}): CalendarEntry[][] {
  const dates = weekDates(monday);
  const codes = new Map(plan.courses.map((planned) => [planned.plan_course_id, planned.code]));
  const meetingCourse = new Map(plan.courses.flatMap((planned) => planned.meetings.map((meeting) => [meeting.id, planned.code] as const)));
  const items = new Map(plan.items.map((item) => [item.id, item]));
  const titles = new Map(events.map((event) => [event.id, event.title]));

  const conflictDates = new Map<string, Set<string>>();
  for (const conflict of report.conflicts) {
    for (const side of conflict.sides) {
      const key = sideKey(side);
      const known = conflictDates.get(key) ?? new Set<string>();
      for (const date of conflict.dates) known.add(date);
      conflictDates.set(key, known);
    }
  }

  const days: CalendarEntry[][] = dates.map(() => []);

  for (const item of plan.items) {
    const index = dates.indexOf(item.on_date);
    if (index === -1 || item.start_minute !== null) continue;
    days[index].push({
      key: `item:${item.id}`,
      kind: "item",
      label: item.title,
      detail: item.plan_course_id ? codes.get(item.plan_course_id) : undefined,
      href: `#item-${item.id}`,
      date: item.on_date,
      start_minute: null,
      end_minute: null,
      conflict: false,
    });
  }

  for (const slot of slots) {
    const index = dates.indexOf(slot.date);
    if (index === -1) continue;
    const key = sideKey(slot.side);
    const conflict = conflictDates.get(key)?.has(slot.date) ?? false;
    const base = { key: `${key}:${slot.date}:${slot.start_minute}`, date: slot.date, start_minute: slot.start_minute, end_minute: slot.end_minute, conflict };
    if (slot.side.kind === "meeting") {
      days[index].push({ ...base, kind: "class", label: meetingCourse.get(slot.side.meeting_id) ?? "A course", href: `#meeting-${slot.side.meeting_id}` });
    } else if (slot.side.kind === "item") {
      const item = items.get(slot.side.item_id);
      days[index].push({
        ...base,
        kind: "item",
        label: item?.title ?? "An item",
        detail: item?.plan_course_id ? codes.get(item.plan_course_id) : undefined,
        href: `#item-${slot.side.item_id}`,
      });
    } else {
      days[index].push({ ...base, kind: "event", label: titles.get(slot.side.event_id) ?? "An event", href: `#event-${slot.side.event_id}` });
    }
  }

  return days.map((entries) =>
    entries.sort(
      (a, b) =>
        (a.start_minute ?? -1) - (b.start_minute ?? -1) || (a.end_minute ?? -1) - (b.end_minute ?? -1) || a.label.localeCompare(b.label),
    ),
  );
}

const BEIRUT_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Beirut",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const BEIRUT_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Wed, 17 Feb 2027 · 13:00–15:00" in Beirut, or both ends in full when it spans days. */
export function formatEventWhen(event: { starts_at: string; ends_at: string }): string {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const startDate = BEIRUT_DATE.format(start);
  const endDate = BEIRUT_DATE.format(end);
  if (startDate === endDate) return `${startDate} · ${BEIRUT_TIME.format(start)}–${BEIRUT_TIME.format(end)}`;
  return `${startDate} ${BEIRUT_TIME.format(start)} – ${endDate} ${BEIRUT_TIME.format(end)}`;
}

/** "Tue, 2 Mar 2027 · 10:00–11:00", or "· all day". */
export function formatItemWhen(item: { on_date: string; start_minute: number | null; end_minute: number | null }): string {
  const times =
    item.start_minute === null || item.end_minute === null
      ? "all day"
      : `${timeFromMinutes(item.start_minute)}–${timeFromMinutes(item.end_minute)}`;
  return `${formatTermDate(item.on_date)} · ${times}`;
}

/**
 * Everything the plan page's calendar needs: the week to show (the
 * requested ?week= if it is in range) and what is on it.
 */
export function planCalendar({
  plan,
  events,
  report,
  week,
  today,
}: {
  plan: PlanDetails;
  events: readonly PlannerEvent[];
  report: ConflictReport;
  week: unknown;
  today: string;
}): { monday: string; range: { first: string; last: string }; today: string; days: CalendarEntry[][] } {
  const going = events.filter((event) => event.going);
  const slots = calendarSlots({ ...plan, events: going });
  const range = calendarRange(plan, [...plan.items.map((item) => item.on_date), ...slots.map((slot) => slot.date)]);
  const monday = pickWeek(week, today, plan, range);
  return { monday, range, today, days: weekEntries({ plan, events: going, slots, report, monday }) };
}
