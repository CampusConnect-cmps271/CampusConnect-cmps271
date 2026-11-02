import type { Meeting, PlanItem, PlannedCourse, PlannerEvent, Weekday } from "./types";

/**
 * Schedule-conflict engine (SCRUM-67). Pure: no database, no current time
 * and no use of the machine's time zone. It only uses Date.UTC, the
 * getUTC* methods and Intl with an explicit timeZone.
 *
 * It places everything with a time on the calendar as UTC intervals:
 * - weekly meetings, on every matching date of the term, in the meeting's
 *   own time zone;
 * - the student's own items, once, in Beirut time (all-day items have no
 *   time and are never checked);
 * - events the student is going to, at their stored instants.
 * Two of them conflict when their intervals overlap as half-open intervals
 * [start, end): one ending at 10:45 and one starting at 10:45 do not.
 * Every pair is compared this way; there is no same-zone shortcut, so zones
 * and daylight-saving changes are always handled alike.
 *
 * Daylight-saving rules (as Temporal's "compatible" disambiguation):
 * - A wall-clock time that happens twice, in the hour repeated when clocks
 *   go back, means its first occurrence.
 * - A start time that doesn't exist, skipped when clocks go forward, can't
 *   be placed: that date is left out and the meeting or item is reported
 *   invalid ("starts_in_dst_gap") with the dates. An end time that doesn't
 *   exist means the moment the clocks jump.
 */

/** Overlaps are reported in Beirut time, whatever zones the meetings use. Items are in Beirut time. */
export const DISPLAY_TIMEZONE = "Asia/Beirut";

export type ConflictStatus = "empty" | "conflicts" | "incomplete" | "clear";

export type MeetingSide = { kind: "meeting"; meeting_id: string; plan_course_id: string; course_id: string };
export type ItemSide = { kind: "item"; item_id: string };
export type EventSide = { kind: "event"; event_id: string };

/** One of the two things in a conflict. */
export type ConflictSide = MeetingSide | ItemSide | EventSide;

export type ScheduleConflict = {
  /** The two sides: meetings in plan order, then items, then events. */
  sides: [ConflictSide, ConflictSide];
  /** The overlap's weekday and window in Asia/Beirut. */
  weekday: Weekday;
  start_minute: number;
  /** Over 1440 when the overlap runs past Beirut midnight. */
  end_minute: number;
  /** True when two weekly meetings overlap like this every week both meet. */
  every_week: boolean;
  /** Beirut dates (YYYY-MM-DD) of each overlap, in order. */
  dates: string[];
};

export type InvalidReason = "bad_range" | "unknown_timezone" | "no_dates_in_term" | "starts_in_dst_gap";

/** A meeting or item the check couldn't place. Events always can be. */
export type InvalidEntry = (MeetingSide | ItemSide) & {
  reason: InvalidReason;
  /** For starts_in_dst_gap, the dates (in the entry's zone) it was left out. */
  dates: string[];
};

export type UnknownCourse = { plan_course_id: string; course_id: string };

export type ConflictReport = {
  status: ConflictStatus;
  conflicts: ScheduleConflict[];
  /** Courses with no meetings: their schedule is unknown. */
  unknown: UnknownCourse[];
  invalid: InvalidEntry[];
};

type MeetingTimes = Pick<Meeting, "id" | "weekday" | "start_minute" | "end_minute" | "timezone">;

export type ConflictInput = {
  starts_on: string;
  ends_on: string;
  courses: readonly (Pick<PlannedCourse, "plan_course_id" | "course_id"> & { meetings: readonly MeetingTimes[] })[];
  /** The student's own items; all-day ones are skipped. */
  items?: readonly Pick<PlanItem, "id" | "on_date" | "start_minute" | "end_minute">[];
  /** Events the student is going to. */
  events?: readonly Pick<PlannerEvent, "id" | "starts_at" | "ends_at">[];
};

const MINUTE = 60_000;
const DAY = 86_400_000;
const HOURS_14 = 14 * 60 * MINUTE;

const formats = new Map<string, Intl.DateTimeFormat | null>();

/** A formatter for wall-clock readings in `timeZone`, or null for an unknown zone. */
function wallClock(timeZone: string): Intl.DateTimeFormat | null {
  if (!formats.has(timeZone)) {
    let format: Intl.DateTimeFormat | null = null;
    try {
      format = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
    } catch {
      format = null;
    }
    formats.set(timeZone, format);
  }
  return formats.get(timeZone) ?? null;
}

/** The wall clock at instant `utc`, as milliseconds on the UTC scale. */
function wallAt(format: Intl.DateTimeFormat, utc: number): number {
  const parts = format.formatToParts(utc);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}

/** The zone's offset from UTC at `utc`, in minutes. */
function offsetAt(format: Intl.DateTimeFormat, utc: number): number {
  return Math.round((wallAt(format, utc) - Math.floor(utc / 1000) * 1000) / MINUTE);
}

/**
 * The UTC instant of a wall-clock time (on the UTC scale) in a zone. The
 * offset in force is one of those 14 hours either side, since no zone is
 * further than that from UTC and daylight-saving changes are months apart.
 */
function placeWallTime(format: Intl.DateTimeFormat, wall: number): { instant: number; skipped: boolean } {
  const before = offsetAt(format, wall - HOURS_14);
  const after = offsetAt(format, wall + HOURS_14);
  const matches = [...new Set([before, after])]
    .map((offset) => wall - offset * MINUTE)
    .filter((instant) => wallAt(format, instant) === wall)
    .sort((a, b) => a - b);
  // Repeated: the earlier instant. Skipped: read with the offset before the change.
  return matches.length ? { instant: matches[0], skipped: false } : { instant: wall - before * MINUTE, skipped: true };
}

function parseDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(day).toISOString().slice(0, 10) === value ? day : null;
}

const isoDate = (day: number) => new Date(day).toISOString().slice(0, 10);
const isoWeekday = (day: number) => (((new Date(day).getUTCDay() + 6) % 7) + 1) as Weekday;

type Occurrence = { start: number; end: number };

type Expanded = { occurrences: Occurrence[]; reason?: InvalidReason; dates: string[] };

/** Something placed on the calendar, with its sorted, non-overlapping occurrences. */
type Placed = { side: ConflictSide; occurrences: Occurrence[]; weekly: boolean };

const isMinute = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;

function validRange(meeting: MeetingTimes): boolean {
  const { weekday, start_minute: start, end_minute: end } = meeting;
  return isMinute(weekday, 1, 7) && isMinute(start, 0, 1439) && isMinute(end, 1, 1440) && end > start;
}

/** A meeting's occurrences in the term, or why it can't be placed. */
function expandMeeting(meeting: MeetingTimes, firstDay: number | null, lastDay: number | null): Expanded {
  if (!validRange(meeting)) return { occurrences: [], reason: "bad_range", dates: [] };

  const format = wallClock(meeting.timezone);
  if (!format) return { occurrences: [], reason: "unknown_timezone", dates: [] };

  const occurrences: Occurrence[] = [];
  const skipped: string[] = [];
  if (firstDay !== null && lastDay !== null) {
    for (let day = firstDay; day <= lastDay; day += DAY) {
      if (isoWeekday(day) !== meeting.weekday) continue;
      const start = placeWallTime(format, day + meeting.start_minute * MINUTE);
      if (start.skipped) {
        skipped.push(isoDate(day));
        continue;
      }
      const end = placeWallTime(format, day + meeting.end_minute * MINUTE);
      occurrences.push({ start: start.instant, end: end.instant });
    }
  }

  if (skipped.length) return { occurrences, reason: "starts_in_dst_gap", dates: skipped };
  if (!occurrences.length) return { occurrences, reason: "no_dates_in_term", dates: [] };
  return { occurrences, dates: [] };
}

/** A timed item's single occurrence in Beirut time, or why it can't be placed. */
function expandItem(item: NonNullable<ConflictInput["items"]>[number]): Expanded {
  const day = parseDate(item.on_date);
  const { start_minute: start, end_minute: end } = item;
  if (day === null || start === null || end === null || !isMinute(start, 0, 1439) || !isMinute(end, 1, 1440) || end <= start) {
    return { occurrences: [], reason: "bad_range", dates: [] };
  }

  const format = wallClock(DISPLAY_TIMEZONE);
  if (!format) return { occurrences: [], dates: [] };
  const placedStart = placeWallTime(format, day + start * MINUTE);
  if (placedStart.skipped) return { occurrences: [], reason: "starts_in_dst_gap", dates: [item.on_date] };
  return { occurrences: [{ start: placedStart.instant, end: placeWallTime(format, day + end * MINUTE).instant }], dates: [] };
}

/** Everything with a time, plus what couldn't be placed. */
function placeAll(input: ConflictInput): { placed: Placed[]; unknown: UnknownCourse[]; invalid: InvalidEntry[] } {
  const firstDay = parseDate(input.starts_on);
  const lastDay = parseDate(input.ends_on);

  const unknown: UnknownCourse[] = [];
  const invalid: InvalidEntry[] = [];
  const placed: Placed[] = [];

  for (const course of input.courses) {
    if (course.meetings.length === 0) {
      unknown.push({ plan_course_id: course.plan_course_id, course_id: course.course_id });
      continue;
    }
    for (const meeting of course.meetings) {
      const side: MeetingSide = {
        kind: "meeting",
        meeting_id: meeting.id,
        plan_course_id: course.plan_course_id,
        course_id: course.course_id,
      };
      const result = expandMeeting(meeting, firstDay, lastDay);
      if (result.reason) invalid.push({ ...side, reason: result.reason, dates: result.dates });
      if (result.occurrences.length) placed.push({ side, occurrences: result.occurrences, weekly: true });
    }
  }

  for (const item of input.items ?? []) {
    if (item.start_minute === null && item.end_minute === null) continue;
    const side: ItemSide = { kind: "item", item_id: item.id };
    const result = expandItem(item);
    if (result.reason) invalid.push({ ...side, reason: result.reason, dates: result.dates });
    if (result.occurrences.length) placed.push({ side, occurrences: result.occurrences, weekly: false });
  }

  for (const event of input.events ?? []) {
    const start = Date.parse(event.starts_at);
    const end = Date.parse(event.ends_at);
    if (!(end > start)) continue;
    placed.push({ side: { kind: "event", event_id: event.id }, occurrences: [{ start, end }], weekly: false });
  }

  return { placed, unknown, invalid };
}

/** Overlapping parts of two sorted, non-overlapping occurrence lists. */
function overlaps(a: Occurrence[], b: Occurrence[]): Occurrence[] {
  const found: Occurrence[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start < end) found.push({ start, end });
    if (a[i].end <= b[j].end) i += 1;
    else j += 1;
  }
  return found;
}

/** Overlaps of one pair, grouped by their Beirut weekday and window. */
function pairConflicts(first: Placed, second: Placed): ScheduleConflict[] {
  const display = wallClock(DISPLAY_TIMEZONE);
  if (!display) return [];

  const groups = new Map<string, ScheduleConflict>();
  for (const overlap of overlaps(first.occurrences, second.occurrences)) {
    const startWall = wallAt(display, overlap.start);
    const endWall = wallAt(display, overlap.end);
    const day = startWall - (startWall % DAY);
    const weekday = isoWeekday(day);
    const startMinute = (startWall - day) / MINUTE;
    const endMinute = (endWall - day) / MINUTE;
    const key = `${weekday}|${startMinute}|${endMinute}`;
    const group = groups.get(key) ?? {
      sides: [first.side, second.side],
      weekday,
      start_minute: startMinute,
      end_minute: endMinute,
      every_week: false,
      dates: [],
    };
    group.dates.push(isoDate(day));
    groups.set(key, group);
  }

  const conflicts = [...groups.values()];
  const bothMeet = Math.min(first.occurrences.length, second.occurrences.length);
  if (first.weekly && second.weekly && conflicts.length === 1 && conflicts[0].dates.length === bothMeet) {
    conflicts[0].every_week = true;
  }
  return conflicts;
}

/** Checks a plan's meetings, timed items and going events for overlaps. */
export function detectConflicts(input: ConflictInput): ConflictReport {
  const { placed, unknown, invalid } = placeAll(input);

  const conflicts: ScheduleConflict[] = [];
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) conflicts.push(...pairConflicts(placed[i], placed[j]));
  }
  conflicts.sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || a.start_minute - b.start_minute);

  const status: ConflictStatus =
    placed.length + unknown.length + invalid.length === 0
      ? "empty"
      : conflicts.length
        ? "conflicts"
        : unknown.length || invalid.length
          ? "incomplete"
          : "clear";

  return { status, conflicts, unknown, invalid };
}

/** One stretch of something on one Beirut day of the calendar. */
export type CalendarSlot = {
  side: ConflictSide;
  /** Beirut date, YYYY-MM-DD. */
  date: string;
  /** Minutes after Beirut midnight; a stretch never crosses midnight. */
  start_minute: number;
  end_minute: number;
};

/**
 * Where everything with a time falls in Beirut, day by day: what the
 * calendar draws. Things running past midnight are split at it.
 */
export function calendarSlots(input: ConflictInput): CalendarSlot[] {
  const display = wallClock(DISPLAY_TIMEZONE);
  if (!display) return [];

  const slots: CalendarSlot[] = [];
  for (const { side, occurrences } of placeAll(input).placed) {
    for (const occurrence of occurrences) {
      const startWall = wallAt(display, occurrence.start);
      const endWall = wallAt(display, occurrence.end);
      for (let day = startWall - (startWall % DAY); day < endWall; day += DAY) {
        const from = Math.max(startWall, day);
        const to = Math.min(endWall, day + DAY);
        if (to > from) {
          slots.push({ side, date: isoDate(day), start_minute: (from - day) / MINUTE, end_minute: (to - day) / MINUTE });
        }
      }
    }
  }
  return slots.sort((a, b) => a.date.localeCompare(b.date) || a.start_minute - b.start_minute || a.end_minute - b.end_minute);
}
