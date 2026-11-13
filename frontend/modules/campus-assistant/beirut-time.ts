/** Times in the assistant's answers are Beirut time, whatever the server's own zone is. */

const DATE_AND_TIME = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Beirut" });
const DATE_ONLY = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "Asia/Beirut" });
const ISO_DAY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Beirut" });

/** "Friday, 13 November 2026 at 18:00" */
export function formatBeirutTime(value: string | Date): string {
  return DATE_AND_TIME.format(new Date(value));
}

/** "Friday, 13 November 2026" */
export function formatBeirutDay(value: string | Date): string {
  return DATE_ONLY.format(new Date(value));
}

/** "2026-11-13": the calendar day in Beirut, the form the database stores dates in. */
export function beirutIsoDay(value: string | Date): string {
  return ISO_DAY.format(new Date(value));
}
