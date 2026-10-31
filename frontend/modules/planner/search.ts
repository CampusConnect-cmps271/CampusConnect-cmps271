import { PLANNER_LIMITS } from "./schema";

/** The planner's search text from ?q=, tidied and bounded. */
export function parsePlannerSearch(value: string | string[] | undefined): string {
  const text = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, PLANNER_LIMITS.searchLength);
}

/** A quoted ILIKE pattern, so commas, parentheses and quotes stay search text. */
function containsPattern(text: string): string {
  const literal = text.replace(/[\\%_]/g, "\\$&");
  return JSON.stringify(`%${literal}%`);
}

/**
 * A PostgREST `or` filter matching a course's code or name. The same quoting
 * as the course catalogue's search (modules/courses has no public API, so the
 * planner keeps its own copy).
 */
export function courseSearchFilter(query: string): string {
  // Students commonly type compact codes such as CMPS240.
  const code = query.replace(/^([a-z]{2,8})\s*(\d{3}[a-z]?)$/i, "$1 $2");
  return `code.ilike.${containsPattern(code)},name.ilike.${containsPattern(query)}`;
}
