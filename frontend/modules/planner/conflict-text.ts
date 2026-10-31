import type { ConflictReport, InvalidMeeting, ScheduleConflict } from "./conflicts";
import { formatTermDate } from "./terms";
import { timeFromMinutes, weekdayLabel } from "./time";
import type { Meeting } from "./types";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The panel's headline for each status. */
export function conflictHeadline(report: ConflictReport): string {
  switch (report.status) {
    case "empty":
      return "No courses to check yet";
    case "conflicts":
      return `${plural(report.conflicts.length, "conflict", "conflicts")} found`;
    case "clear":
      return "No conflicts among the times you entered";
    case "incomplete": {
      const missing: string[] = [];
      if (report.unknown.length) {
        missing.push(`${plural(report.unknown.length, "course", "courses")} ${report.unknown.length === 1 ? "has" : "have"} no times`);
      }
      if (report.invalid.length) {
        missing.push(`${plural(report.invalid.length, "meeting", "meetings")} ${report.invalid.length === 1 ? "needs" : "need"} fixing`);
      }
      return `No overlaps among the times you entered, but ${missing.join(" and ")}`;
    }
  }
}

/** "Tuesday 10:00–10:45", in Beirut time. */
export function overlapWindow(conflict: ScheduleConflict): string {
  const end =
    conflict.end_minute > 1440
      ? `${timeFromMinutes(conflict.end_minute - 1440)} the next day`
      : timeFromMinutes(conflict.end_minute);
  return `${weekdayLabel(conflict.weekday, "long")} ${timeFromMinutes(conflict.start_minute)}–${end}`;
}

/** "every week", or the dates when it happens only on some. */
export function overlapDates(conflict: ScheduleConflict): string {
  if (conflict.every_week) return "every week";
  const dates = conflict.dates.map(formatTermDate);
  if (dates.length === 1) return `only on ${dates[0]}`;
  if (dates.length <= 4) return `only on ${dates.slice(0, -1).join(", ")} and ${dates[dates.length - 1]}`;
  return `on ${dates.length} dates, from ${dates[0]} to ${dates[dates.length - 1]}`;
}

/** What is wrong with a meeting the check couldn't place, and what to change. */
export function invalidMeetingHelp(
  invalid: InvalidMeeting,
  meeting: Pick<Meeting, "weekday" | "start_minute" | "timezone"> | undefined,
  term: { starts_on: string; ends_on: string },
): string {
  switch (invalid.reason) {
    case "bad_range":
      return "Its times aren't valid: a meeting must end after it starts, on the same day. Edit its times.";
    case "unknown_timezone":
      return `“${meeting?.timezone ?? ""}” isn't a time zone CampusConnect recognises. Edit it to an IANA name such as Asia/Beirut.`;
    case "no_dates_in_term":
      return `${meeting ? weekdayLabel(meeting.weekday, "long") : "Its day"} never falls between ${formatTermDate(term.starts_on)} and ${formatTermDate(term.ends_on)}, so it never meets this term. Change its day.`;
    case "starts_in_dst_gap":
      return `${meeting ? timeFromMinutes(meeting.start_minute) : "Its start time"} doesn't exist on ${invalid.dates.map(formatTermDate).join(", ")} in ${meeting?.timezone ?? "its time zone"}: the clocks go forward an hour. Move its start time.`;
  }
}
