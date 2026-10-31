/**
 * Official AUB term dates: first and last day of classes for all
 * Faculties/Schools except the MD program, from the Office of the
 * Registrar's Important Dates page (read 31 October 2026). Plans copy these
 * dates; students never type them. Add or change a term only from that page.
 */
export const AUB_CALENDAR_SOURCE = "https://www.aub.edu.lb/registrar/pages/importantdates.aspx";

export type OfficialTerm = {
  /** The planner's name: season and calendar year. */
  term: string;
  /** The Registrar's name for the same term. */
  aubName: string;
  startsOn: string;
  endsOn: string;
};

export const OFFICIAL_TERMS: readonly OfficialTerm[] = [
  { term: "Fall 2026", aubName: "Fall 2026-27", startsOn: "2026-08-31", endsOn: "2026-12-04" },
  { term: "Spring 2027", aubName: "Spring 2026-27", startsOn: "2027-01-13", endsOn: "2027-04-27" },
  // Classes end on 15 July for every faculty except Agricultural & Food
  // Sciences (22 July) and the MD program.
  { term: "Summer 2027", aubName: "Summer 2026-27", startsOn: "2027-05-26", endsOn: "2027-07-15" },
];

/** Matches semester_plans_term_valid in the migration. */
export const TERM_PATTERN = /^(Fall|Spring|Summer) 20(2[5-9]|3[0-5])$/;

export function officialTerm(term: string): OfficialTerm | undefined {
  return OFFICIAL_TERMS.find((official) => official.term === term);
}

/** Today's date in Beirut, YYYY-MM-DD. */
export function beirutToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Terms whose classes have not ended by `today` (YYYY-MM-DD). */
export function openTerms(today: string): OfficialTerm[] {
  return OFFICIAL_TERMS.filter((official) => official.endsOn >= today);
}

/** Open terms the student has no plan for yet: what "New plan" offers. */
export function availableTerms(plannedTerms: readonly string[], today: string): OfficialTerm[] {
  return openTerms(today).filter((official) => !plannedTerms.includes(official.term));
}

/** "Wed, 13 Jan 2027" for a YYYY-MM-DD calendar date. */
export function formatTermDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
