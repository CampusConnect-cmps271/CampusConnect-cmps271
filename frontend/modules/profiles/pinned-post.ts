/** Longest excerpt the pinned-post card shows, in characters. */
export const EXCERPT_LENGTH = 160;

/**
 * A one-paragraph preview of a post body: whitespace collapsed, and cut at a
 * word boundary with an ellipsis when it is longer than `maxLength`.
 */
export function excerpt(body: string, maxLength = EXCERPT_LENGTH): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  // Fall back to a hard cut when one word fills most of the space.
  const end = lastSpace > maxLength / 2 ? lastSpace : cut.length;

  return `${cut.slice(0, end).trimEnd()}…`;
}

/**
 * The date a post was published, e.g. "Oct 14, 2026". Fixed to the campus
 * time zone so the server and every student see the same day.
 */
export function formatPostDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "Asia/Beirut",
  }).format(new Date(isoDate));
}
