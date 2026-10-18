/** Longest last-message preview the inbox shows, in characters. */
export const PREVIEW_LENGTH = 80;

const CAMPUS_TIME_ZONE = "Asia/Beirut";

/**
 * One line of a message for the inbox: whitespace collapsed, and cut at a word
 * boundary with an ellipsis when it is longer than `maxLength`. The database
 * sends the first 100 characters, so anything longer than 80 still shows that
 * it was cut.
 */
export function messagePreview(text: string, maxLength = PREVIEW_LENGTH): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= maxLength) return line;

  const cut = line.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  // Fall back to a hard cut when one long word fills most of the space.
  const end = lastSpace > maxLength / 2 ? lastSpace : cut.length;

  return `${cut.slice(0, end).trimEnd()}…`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * How long ago something happened, for the inbox: "just now", "5 minutes ago",
 * "3 hours ago", "yesterday", "3 days ago", then a date ("Oct 12", with the
 * year once it is not this year). Times in the future (clock skew) read as
 * "just now".
 */
export function formatRelativeTime(isoDate: string, now: Date): string {
  const then = new Date(isoDate);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 60 * 60) return relative.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 24 * 60 * 60) return relative.format(-Math.floor(seconds / 3600), "hour");

  const days = calendarDaysBetween(then, now);
  if (days < 7) return relative.format(-days, "day");

  const sameYear = yearIn(then) === yearIn(now);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: CAMPUS_TIME_ZONE,
  }).format(then);
}

/**
 * When a message was sent, e.g. "Oct 18, 2:05 PM". Fixed to the campus time
 * zone so the server and every browser render the same text.
 */
export function formatMessageTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CAMPUS_TIME_ZONE,
  }).format(new Date(isoDate));
}

/** Calendar date in the campus time zone, as yyyy-mm-dd. */
function campusDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAMPUS_TIME_ZONE }).format(date);
}

function yearIn(date: Date): string {
  return campusDay(date).slice(0, 4);
}

/** Whole calendar days from `then` to `now` in the campus time zone. */
function calendarDaysBetween(then: Date, now: Date): number {
  const start = Date.parse(campusDay(then));
  const end = Date.parse(campusDay(now));
  return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}
