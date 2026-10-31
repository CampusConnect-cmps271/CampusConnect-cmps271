import type { Meeting, PlannedCourse, Weekday } from "./types";

/**
 * Weekly schedule-conflict engine (SCRUM-67). Pure: no database, no current
 * time and no use of the machine's time zone. It only uses Date.UTC, the
 * getUTC* methods and Intl with an explicit timeZone.
 *
 * Every meeting is expanded into dated occurrences on the term's dates, in
 * the meeting's own time zone, and each occurrence is converted to UTC with
 * Intl. Two meetings conflict when occurrences overlap as half-open
 * intervals [start, end): a meeting ending at 10:45 and one starting at
 * 10:45 do not. Every pair is compared this way; there is no same-zone
 * shortcut, so zones and daylight-saving changes are always handled alike.
 *
 * Daylight-saving rules (as Temporal's "compatible" disambiguation):
 * - A wall-clock time that happens twice, in the hour repeated when clocks
 *   go back, means its first occurrence.
 * - A start time that doesn't exist, skipped when clocks go forward, can't
 *   be placed: that date is left out and the meeting is reported invalid
 *   ("starts_in_dst_gap") with the dates. An end time that doesn't exist
 *   means the moment the clocks jump.
 */

/** Overlaps are reported in Beirut time, whatever zones the meetings use. */
export const DISPLAY_TIMEZONE = "Asia/Beirut";

export type ConflictStatus = "empty" | "conflicts" | "incomplete" | "clear";

export type ConflictSide = { meeting_id: string; plan_course_id: string; course_id: string };

export type ScheduleConflict = {
  /** The two meetings, in plan order. They may belong to the same course. */
  meetings: [ConflictSide, ConflictSide];
  /** The overlap's weekday and window in Asia/Beirut. */
  weekday: Weekday;
  start_minute: number;
  /** Over 1440 when the overlap runs past Beirut midnight. */
  end_minute: number;
  /** True when they overlap like this every week both meet. */
  every_week: boolean;
  /** Beirut dates (YYYY-MM-DD) of each overlap, in order. */
  dates: string[];
};

export type InvalidReason = "bad_range" | "unknown_timezone" | "no_dates_in_term" | "starts_in_dst_gap";

export type InvalidMeeting = ConflictSide & {
  reason: InvalidReason;
  /** For starts_in_dst_gap, the dates (in the meeting's zone) it was left out. */
  dates: string[];
};

export type UnknownCourse = { plan_course_id: string; course_id: string };

export type ConflictReport = {
  status: ConflictStatus;
  conflicts: ScheduleConflict[];
  /** Courses with no meetings: their schedule is unknown. */
  unknown: UnknownCourse[];
  invalid: InvalidMeeting[];
};

export type ConflictInput = {
  starts_on: string;
  ends_on: string;
  courses: readonly (Pick<PlannedCourse, "plan_course_id" | "course_id"> & {
    meetings: readonly Pick<Meeting, "id" | "weekday" | "start_minute" | "end_minute" | "timezone">[];
  })[];
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

type Placed = { side: ConflictSide; occurrences: Occurrence[] };

function validRange(meeting: ConflictInput["courses"][number]["meetings"][number]): boolean {
  const { weekday, start_minute: start, end_minute: end } = meeting;
  return (
    Number.isInteger(weekday) && weekday >= 1 && weekday <= 7 &&
    Number.isInteger(start) && start >= 0 && start <= 1439 &&
    Number.isInteger(end) && end >= 1 && end <= 1440 &&
    end > start
  );
}

/** A meeting's occurrences in the term, or why it can't be placed. */
function expand(
  meeting: ConflictInput["courses"][number]["meetings"][number],
  firstDay: number | null,
  lastDay: number | null,
): { occurrences: Occurrence[]; reason?: InvalidReason; dates: string[] } {
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
      meetings: [first.side, second.side],
      weekday,
      start_minute: startMinute,
      end_minute: endMinute,
      every_week: false,
      dates: [],
    };
    group.dates.push(isoDate(day));
    groups.set(key, group);
  }

  const bothMeet = Math.min(first.occurrences.length, second.occurrences.length);
  const conflicts = [...groups.values()];
  if (conflicts.length === 1 && conflicts[0].dates.length === bothMeet) conflicts[0].every_week = true;
  return conflicts;
}

/** Checks a plan's meetings for overlaps on the term's dates. */
export function detectConflicts(plan: ConflictInput): ConflictReport {
  const firstDay = parseDate(plan.starts_on);
  const lastDay = parseDate(plan.ends_on);

  const unknown: UnknownCourse[] = [];
  const invalid: InvalidMeeting[] = [];
  const placed: Placed[] = [];

  for (const course of plan.courses) {
    if (course.meetings.length === 0) {
      unknown.push({ plan_course_id: course.plan_course_id, course_id: course.course_id });
      continue;
    }
    for (const meeting of course.meetings) {
      const side = { meeting_id: meeting.id, plan_course_id: course.plan_course_id, course_id: course.course_id };
      const result = expand(meeting, firstDay, lastDay);
      if (result.reason) invalid.push({ ...side, reason: result.reason, dates: result.dates });
      if (result.occurrences.length) placed.push({ side, occurrences: result.occurrences });
    }
  }

  const conflicts: ScheduleConflict[] = [];
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) conflicts.push(...pairConflicts(placed[i], placed[j]));
  }
  conflicts.sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || a.start_minute - b.start_minute);

  const status: ConflictStatus =
    plan.courses.length === 0
      ? "empty"
      : conflicts.length
        ? "conflicts"
        : unknown.length || invalid.length
          ? "incomplete"
          : "clear";

  return { status, conflicts, unknown, invalid };
}
