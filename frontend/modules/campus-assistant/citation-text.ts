import type { Citation } from "./schema";

const DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/**
 * The words shown beside a citation: where it came from and, for a page that was
 * fetched, the day it was. Live data (clubs, events, the student's own plan) has
 * no fetch date, so only its source is named. `source_label` may be missing on a
 * reply produced before labels existed; the text then stays honest and generic
 * instead of guessing.
 */
export function citationSourceText(citation: Pick<Citation, "retrieved_at"> & { source_label?: string }): string {
  if (citation.retrieved_at === null) return citation.source_label ?? "CampusConnect";

  const date = new Date(citation.retrieved_at);
  const when = Number.isNaN(date.getTime()) ? "retrieved on an unknown date" : `retrieved ${DATE.format(date)}`;
  return citation.source_label ? `${citation.source_label}, ${when}` : when;
}
