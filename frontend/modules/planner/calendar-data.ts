import { calendarOccurrences, type CalendarOccurrence, type CalendarSlot, type ConflictSide } from "./conflicts";
import { sessionMeetings, type ResisSection } from "./sections";
import type { Meeting, PlanDetails, PlannerEvent } from "./types";

/**
 * One list of everything on a student's calendar (SCRUM-243 / SP4-01):
 * class sessions from every plan (typed times and AUB section times), the
 * student's own items, their saved events and those events' reminders.
 * Pure: the server's getCalendarData loads the rows and calls this, and the
 * plan page's week calendar turns its own slots into entries the same way.
 */

export type CalendarDataKind = "class" | "item" | "event" | "reminder";

/** One stretch of an entry on one Beirut day. */
export type DaySlice = Pick<CalendarSlot, "date" | "start_minute" | "end_minute">;

export type CalendarDataEntry = {
  kind: CalendarDataKind;
  /** Stable across loads: class:<meeting>:<date>, item:<item>, event:<event>, reminder:<event>. */
  id: string;
  title: string;
  /** ISO instants. Null for an all-day item; equal for a reminder, which is a moment. */
  starts_at: string | null;
  ends_at: string | null;
  /** An all-day item's Beirut date (YYYY-MM-DD); null for everything else. */
  all_day_date: string | null;
  /** Where it falls on Beirut days. Empty for an all-day item. */
  slices: DaySlice[];
  /** The plan a class or item belongs to; null for events and reminders. */
  plan_id: string | null;
  /** Its page: the plan, at the row, or the event. */
  href: string;
  /** The id of its row on the plan page, e.g. "meeting-<id>"; null for reminders. */
  anchor: string | null;
  /** What the conflict check calls it; null for all-day items and reminders. */
  side: ConflictSide | null;
  /** A class's course, or the course an item belongs to. */
  course_code?: string;
  /** A class's times: typed by the student, or from AUB's schedule (Resis). */
  source?: "manual" | "resis";
  crn?: string | null;
  /** A class from a chosen section: its number, and the session's type ("Lecture") from the snapshot. */
  section?: string;
  class_type?: string;
  /** Where a class session (from the snapshot) or an event takes place. */
  location?: string;
  /** An event's going mark and whether it was cancelled. */
  going?: boolean;
  cancelled?: boolean;
  /** The event a reminder is for, and when that event starts. */
  event_id?: string;
  event_starts_at?: string;
};

/** Chosen sections as the active snapshot lists them, by CRN: where their sessions' types and rooms come from. */
export type SectionDetails = ReadonlyMap<string, ResisSection>;

/** The snapshot session a section meeting row came from, if the snapshot still lists it. */
function sessionFor(section: ResisSection | undefined, meeting: Pick<Meeting, "weekday" | "start_minute" | "end_minute">) {
  return section?.sessions?.find((session) =>
    sessionMeetings(session).some(
      (row) => row.weekday === meeting.weekday && row.start_minute === meeting.start_minute && row.end_minute === meeting.end_minute,
    ),
  );
}

const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim() || undefined;

/** A saved event as getCalendarData reads it. */
export type SavedCalendarEvent = PlannerEvent & {
  cancelled: boolean;
  reminder_enabled: boolean;
  reminder_minutes_before: number;
};

const sideKey = (side: ConflictSide) =>
  side.kind === "meeting" ? `meeting-${side.meeting_id}` : side.kind === "item" ? `item-${side.item_id}` : `event-${side.event_id}`;

type EventInfo = Pick<PlannerEvent, "id" | "title"> & Partial<Pick<SavedCalendarEvent, "going" | "cancelled" | "location">>;

/**
 * Turns timed occurrences into entries: classes and timed items of `plan`,
 * and events from `events`. Shared by getCalendarData and the week calendar,
 * so both name and link things alike. `details` adds a section class's
 * session type and room from the snapshot.
 */
export function occurrenceEntries(
  occurrences: readonly CalendarOccurrence[],
  { plan, events = [], details }: { plan?: PlanDetails; events?: readonly EventInfo[]; details?: SectionDetails },
): CalendarDataEntry[] {
  const meetings = new Map(
    (plan?.courses ?? []).flatMap((planned) => planned.meetings.map((meeting) => [meeting.id, { planned, meeting }] as const)),
  );
  const codes = new Map((plan?.courses ?? []).map((planned) => [planned.plan_course_id, planned.code]));
  const items = new Map((plan?.items ?? []).map((item) => [item.id, item]));
  const eventInfo = new Map(events.map((event) => [event.id, event]));

  return occurrences.flatMap((occurrence): CalendarDataEntry[] => {
    const { side } = occurrence;
    const anchor = sideKey(side);
    const base = {
      starts_at: occurrence.starts_at,
      ends_at: occurrence.ends_at,
      all_day_date: null,
      slices: occurrence.slots.map(({ date, start_minute, end_minute }) => ({ date, start_minute, end_minute })),
      anchor,
      side,
    };
    if (side.kind === "meeting") {
      const found = meetings.get(side.meeting_id);
      const crn = found?.meeting.crn ?? null;
      const chosen = crn ? found?.planned.sections?.find((section) => section.crn === crn) : undefined;
      const detail = crn ? details?.get(crn) : undefined;
      const session = found && detail ? sessionFor(detail, found.meeting) : undefined;
      return [
        {
          ...base,
          kind: "class",
          id: `class:${side.meeting_id}:${occurrence.slots[0]?.date ?? occurrence.starts_at.slice(0, 10)}`,
          title: found?.planned.code ?? "A course",
          plan_id: plan?.id ?? null,
          href: plan ? `/planner/${plan.id}#${anchor}` : "/planner",
          course_code: found?.planned.code,
          source: found?.meeting.source ?? "manual",
          crn,
          section: text(chosen?.section ?? detail?.section),
          class_type: text(session?.type),
          location: text(session?.location),
        },
      ];
    }
    if (side.kind === "item") {
      const item = items.get(side.item_id);
      return [
        {
          ...base,
          kind: "item",
          id: `item:${side.item_id}`,
          title: item?.title ?? "An item",
          plan_id: plan?.id ?? null,
          href: plan ? `/planner/${plan.id}#${anchor}` : "/planner",
          course_code: item?.plan_course_id ? codes.get(item.plan_course_id) : undefined,
        },
      ];
    }
    const event = eventInfo.get(side.event_id);
    return [
      {
        ...base,
        kind: "event",
        id: `event:${side.event_id}`,
        title: event?.title ?? "An event",
        plan_id: null,
        href: `/events/${side.event_id}`,
        location: text(event?.location),
        going: event?.going,
        cancelled: event?.cancelled,
      },
    ];
  });
}

/** The plan's all-day items as entries. */
export function allDayItemEntries(plan: PlanDetails): CalendarDataEntry[] {
  const codes = new Map(plan.courses.map((planned) => [planned.plan_course_id, planned.code]));
  return plan.items
    .filter((item) => item.start_minute === null || item.end_minute === null)
    .map((item) => ({
      kind: "item" as const,
      id: `item:${item.id}`,
      title: item.title,
      starts_at: null,
      ends_at: null,
      all_day_date: item.on_date,
      slices: [],
      plan_id: plan.id,
      href: `/planner/${plan.id}#item-${item.id}`,
      anchor: `item-${item.id}`,
      side: null,
      course_code: item.plan_course_id ? codes.get(item.plan_course_id) : undefined,
    }));
}

const BEIRUT_MOMENT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Beirut",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A moment's Beirut date and minute of the day. */
function beirutMoment(time: number): DaySlice {
  const parts = Object.fromEntries(BEIRUT_MOMENT.formatToParts(time).map((part) => [part.type, part.value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, start_minute: minute, end_minute: minute };
}

/**
 * A reminder for a saved event: when the student turned it on, the moment
 * set before the event starts. None for a cancelled event.
 */
export function reminderEntry(event: SavedCalendarEvent): CalendarDataEntry | null {
  if (!event.reminder_enabled || event.cancelled) return null;
  const start = Date.parse(event.starts_at);
  if (Number.isNaN(start)) return null;
  const at = start - event.reminder_minutes_before * 60_000;
  const instant = new Date(at).toISOString();
  return {
    kind: "reminder",
    id: `reminder:${event.id}`,
    title: `Reminder: ${event.title}`,
    starts_at: instant,
    ends_at: instant,
    all_day_date: null,
    slices: [beirutMoment(at)],
    plan_id: null,
    href: `/events/${event.id}`,
    anchor: null,
    side: null,
    event_id: event.id,
    event_starts_at: new Date(start).toISOString(),
  };
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

/** Whether any part of an entry falls on a Beirut date from `from` to `to`. */
function touches(entry: CalendarDataEntry, from: string, to: string): boolean {
  if (entry.all_day_date) return inRange(entry.all_day_date, from, to);
  return entry.slices.some((slice) => inRange(slice.date, from, to));
}

function firstDate(entry: CalendarDataEntry): string {
  return entry.all_day_date ?? entry.slices[0]?.date ?? "";
}

/**
 * Everything on the student's calendar from `from` to `to` (Beirut dates,
 * inclusive), in time order with all-day items first on their day:
 * - class sessions of every plan, on the dates of its term, through the
 *   conflict engine's placement, so zones and daylight saving work as on
 *   the plan page;
 * - the plans' own items;
 * - saved events, with the going mark and whether they were cancelled;
 * - a reminder for each saved event that has one on, unless it was cancelled.
 */
export function calendarEntries({
  plans,
  events,
  from,
  to,
  details,
}: {
  plans: readonly PlanDetails[];
  events: readonly SavedCalendarEvent[];
  from: string;
  to: string;
  details?: SectionDetails;
}): CalendarDataEntry[] {
  const entries: CalendarDataEntry[] = [];

  for (const plan of plans) {
    entries.push(...occurrenceEntries(calendarOccurrences({ ...plan, events: [] }), { plan, details }));
    entries.push(...allDayItemEntries(plan));
  }

  const timedEvents = events.map(({ id, starts_at, ends_at }) => ({ id, starts_at, ends_at }));
  entries.push(
    ...occurrenceEntries(calendarOccurrences({ starts_on: from, ends_on: to, courses: [], events: timedEvents }), { events }),
  );
  for (const event of events) {
    const reminder = reminderEntry(event);
    if (reminder) entries.push(reminder);
  }

  return entries
    .filter((entry) => touches(entry, from, to))
    .sort(
      (a, b) =>
        firstDate(a).localeCompare(firstDate(b)) ||
        Number(a.all_day_date === null) - Number(b.all_day_date === null) ||
        (a.starts_at ?? "").localeCompare(b.starts_at ?? "") ||
        (a.ends_at ?? "").localeCompare(b.ends_at ?? "") ||
        a.title.localeCompare(b.title),
    );
}
