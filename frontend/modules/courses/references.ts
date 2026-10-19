import { coursesUrl, type CourseFilters } from "./search";

/** Accept readable route codes while retaining leading zeros and suffixes. */
export function normalizeCourseCode(value: string): string | null {
  const match = /^([A-Z]{2,8})[\s-]*(\d{3}[A-Z]{0,3})$/i.exec(value.trim());
  return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : null;
}

export function courseUrl(code: string, filters?: CourseFilters) {
  const path = `/courses/${encodeURIComponent(code.replace(/ /g, "-"))}`;
  const catalogue = filters ? coursesUrl(filters) : "/courses";
  return path + catalogue.slice("/courses".length);
}

export type PrerequisitePart = { text: string; code?: string };

/**
 * Annotate references, never rewrite registration rules. Only an immediately
 * connected list (e.g. "MATH 201, 202 or 203") inherits a subject prefix.
 * Codes are still checked against the database before becoming links.
 */
export function parsePrerequisiteReferences(text: string): PrerequisitePart[] {
  const parts: PrerequisitePart[] = [];
  const reference = /(?<![A-Z0-9])([A-Z]{2,8})[ \t\u00a0-]*(\d{3}[A-Z]{0,3})(?![A-Z0-9])/gi;
  const continuation = /^(\s*(?:(?:,|\/|\(|\)|\band\b|\bor\b|&)\s*)+)(\d{3}[A-Z]{0,3})(?![A-Z0-9])/i;
  let cursor = 0;
  for (let match = reference.exec(text); match; match = reference.exec(text)) {
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index) });
    parts.push({ text: match[0], code: `${match[1].toUpperCase()} ${match[2].toUpperCase()}` });
    cursor = reference.lastIndex;
    let next = continuation.exec(text.slice(cursor));
    while (next) {
      parts.push({ text: next[1] }, { text: next[2], code: `${match[1].toUpperCase()} ${next[2].toUpperCase()}` });
      cursor += next[0].length;
      next = continuation.exec(text.slice(cursor));
    }
    reference.lastIndex = cursor;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
