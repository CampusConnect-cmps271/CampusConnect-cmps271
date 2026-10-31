import type { Meeting, Weekday } from "./types";

export const WEEKDAYS: readonly { value: Weekday; short: string; long: string }[] = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
];

/** The <datalist> of zone names the plan page renders once for every meeting form. */
export const TIME_ZONE_LIST_ID = "planner-time-zones";

/**
 * The name Intl uses for a time zone the student typed ("asia/beirut" ->
 * "Asia/Beirut"), or null when it isn't an IANA zone this runtime knows.
 */
export function normalizeTimeZone(value: string): string | null {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Minutes after midnight for "HH:MM" (00:00-23:59), or null. */
export function minutesFromTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "HH:MM" for minutes after midnight; 1440 is "24:00". */
export function timeFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function weekdayLabel(weekday: number, form: "short" | "long" = "short"): string {
  return WEEKDAYS.find((day) => day.value === weekday)?.[form] ?? "Unknown day";
}

/** "Tue 09:30–10:45 (Asia/Beirut)" */
export function formatMeeting(
  meeting: Pick<Meeting, "weekday" | "start_minute" | "end_minute" | "timezone">,
): string {
  return `${weekdayLabel(meeting.weekday)} ${timeFromMinutes(meeting.start_minute)}–${timeFromMinutes(meeting.end_minute)} (${meeting.timezone})`;
}

/** Meetings in week order: by day, then start and end time. */
export function sortMeetings<T extends Pick<Meeting, "weekday" | "start_minute" | "end_minute">>(
  meetings: readonly T[],
): T[] {
  return [...meetings].sort(
    (a, b) => a.weekday - b.weekday || a.start_minute - b.start_minute || a.end_minute - b.end_minute,
  );
}
