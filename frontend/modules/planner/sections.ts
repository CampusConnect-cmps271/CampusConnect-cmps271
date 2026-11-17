import { timeFromMinutes, weekdayLabel } from "./time";
import type { Weekday } from "./types";

/**
 * Sections of AUB's imported (Resis) schedule, as the plan page shows them
 * (SCRUM-243). Pure. The database derives the stored meeting rows itself
 * (public.planner_choose_sections); these helpers only describe sections to
 * the student, with the same reading of days and times.
 */

/** One meeting pattern of a section, as the Resis importer stores it. */
export type ResisSession = {
  days?: string | null;
  start?: string | null;
  end?: string | null;
  type?: string | null;
  location?: string | null;
  instructor?: string | null;
};

/** A section in course_offerings.sections, trimmed to what the planner reads. */
export type ResisSection = {
  crn: string;
  section: string;
  sessions?: ResisSession[] | null;
  instructors?: string[] | null;
  connected_crns?: string[] | null;
  connected_labels?: string[] | null;
};

export type SessionMeeting = { weekday: Weekday; start_minute: number; end_minute: number };

/** At most this many CRNs for one planned course: a section and what is linked to it. */
export const MAX_SECTIONS_PER_COURSE = 4;

const DAY_LETTERS = "MTWRFSU";
const TIME = /^\s*([01]\d|2[0-3]):([0-5]\d)\s*$/;

function minutes(value: string | null | undefined): number | null {
  const match = TIME.exec(value ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * The weekly meetings one session gives: one per weekday letter (M T W R F S
 * U, Monday to Sunday; spaces ignored) at its start and end times in Beirut,
 * in weekday order. None when the days or times are blank, "TBA" or
 * unreadable. Mirrors public.planner_resis_session_rows.
 */
export function sessionMeetings(session: ResisSession): SessionMeeting[] {
  const days = (session.days ?? "").replace(/\s/g, "");
  const start = minutes(session.start);
  const end = minutes(session.end);
  if (!/^[MTWRFSU]+$/.test(days) || start === null || end === null || end <= start) return [];
  const weekdays = [...new Set([...days].map((letter) => (DAY_LETTERS.indexOf(letter) + 1) as Weekday))].sort((a, b) => a - b);
  return weekdays.map((weekday) => ({ weekday, start_minute: start, end_minute: end }));
}

/** "Mon, Wed, Fri 09:00–09:50", or null when the session's time isn't set (TBA). */
export function sessionWhen(session: ResisSession): string | null {
  const meetings = sessionMeetings(session);
  if (!meetings.length) return null;
  const { start_minute: start, end_minute: end } = meetings[0];
  return `${meetings.map((meeting) => weekdayLabel(meeting.weekday)).join(", ")} ${timeFromMinutes(start)}–${timeFromMinutes(end)}`;
}

const IMPORTED = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", year: "numeric" });

/** "8 Nov 2026": when a Resis snapshot was fetched, in Beirut. */
export function importedOn(value: string | null | undefined): string {
  return value ? IMPORTED.format(new Date(value)) : "on an unknown date";
}

/**
 * What was just done to a course's sections, shown on its card after the
 * action returns to the plan (?done=<plan course>&what=<this>).
 */
export type SectionNotice = "picked" | "only" | "updated";

export const SECTION_NOTICES: readonly SectionNotice[] = ["picked", "only", "updated"];

/** The card's sentence for a notice; `only` names the one section it chose. */
export function sectionNoticeText(what: SectionNotice, sections: readonly { section: string; crn: string }[]): string {
  if (what === "only" && sections.length === 1) {
    return `Its only section was chosen: Section ${sections[0].section} (CRN ${sections[0].crn}).`;
  }
  if (what === "updated") return "Times updated.";
  return "Section saved.";
}

/** "12 sections", "1 section". */
export function sectionCountLabel(count: number): string {
  return `${count} ${count === 1 ? "section" : "sections"}`;
}

/** The distinct, non-blank session types of a section, e.g. ["Lecture"] or ["Lab"]. */
export function sectionTypes(section: Pick<ResisSection, "sessions">): string[] {
  return [...new Set((section.sessions ?? []).map((session) => (session.type ?? "").trim()).filter(Boolean))];
}

export type SessionLine = { when: string | null; type: string; location: string; instructor: string };

/** One section offered to the student, as the picker lists it. */
export type SectionOption = {
  crn: string;
  section: string;
  types: string[];
  sessions: SessionLine[];
  instructors: string[];
  /** Sections linked to this one (connected CRNs), grouped by what they are. */
  linked: LinkedGroup[];
};

/** A section linked to a chosen one. Another course's linked section has only the importer's label. */
export type LinkedOption = {
  crn: string;
  /** "Section E1 · CRN 30003", or the importer's label for another course's section. */
  label: string;
  sessions: SessionLine[];
};

/** Linked sections of one kind: one may be added alongside the chosen section. */
export type LinkedGroup = {
  /** What they are, lower case for a sentence: "lab", "recitation", "linked section". */
  kind: string;
  options: LinkedOption[];
};

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

function sessionLines(section: Pick<ResisSection, "sessions">): SessionLine[] {
  return (section.sessions ?? []).map((session) => ({
    when: sessionWhen(session),
    type: clean(session.type),
    location: clean(session.location),
    instructor: clean(session.instructor),
  }));
}

const linkedLabel = (target: ResisSection) => `Section ${clean(target.section)} · CRN ${target.crn}`;

const isLecture = (section: Pick<ResisSection, "sessions">) => sectionTypes(section).some((type) => /lecture/i.test(type));

/**
 * The picker's options for a course's sections, lectures first, then in
 * section order, each with its linked sections. A linked CRN that isn't one
 * of the course's sections (another course's lab) is offered with the
 * importer's label for it.
 */
export function sectionOptions(sections: readonly ResisSection[]): SectionOption[] {
  const byCrn = new Map(sections.map((section) => [section.crn, section]));
  return [...sections]
    .sort(
      (a, b) =>
        Number(isLecture(b)) - Number(isLecture(a)) ||
        a.section.localeCompare(b.section, "en", { numeric: true }) ||
        a.crn.localeCompare(b.crn),
    )
    .map((section) => {
      const groups = new Map<string, LinkedGroup>();
      for (const crn of section.connected_crns ?? []) {
        if (crn === section.crn) continue;
        const target = byCrn.get(crn);
        const label = target
          ? linkedLabel(target)
          : clean((section.connected_labels ?? []).find((text) => text.endsWith(`CRN ${crn}`))) || `CRN ${crn}`;
        const kind = target ? sectionTypes(target).join(" / ").toLowerCase() || "linked section" : "linked section";
        const group = groups.get(kind) ?? { kind, options: [] };
        group.options.push({ crn, label, sessions: target ? sessionLines(target) : [] });
        groups.set(kind, group);
      }
      return {
        crn: section.crn,
        section: clean(section.section),
        types: sectionTypes(section),
        sessions: sessionLines(section),
        instructors: [...new Set((section.instructors ?? []).map(clean).filter(Boolean))],
        linked: [...groups.values()],
      };
    });
}

/** "Section 3's lab, CRN 10235, is linked to it. Add it too?" */
export function linkedPrompt(parent: Pick<SectionOption, "section">, group: LinkedGroup): string {
  if (group.options.length === 1) {
    return `Section ${parent.section}'s ${group.kind}, CRN ${group.options[0].crn}, is linked to it. Add it too?`;
  }
  return `Section ${parent.section} has ${group.options.length} linked ${group.kind === "linked section" ? "sections" : `${group.kind} sections`}. Add one?`;
}

/**
 * The CRNs a picker submission chose: the section, then one linked CRN per
 * group of that section, as listed. Anything else in the form is ignored;
 * the database checks the rest.
 */
export function chosenCrns(primary: string, linked: readonly string[]): string[] {
  const crns = [primary, ...linked].map((crn) => crn.trim()).filter((crn) => /^\d{1,10}$/.test(crn));
  return [...new Set(crns)];
}
