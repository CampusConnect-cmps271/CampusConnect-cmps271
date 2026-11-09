import type { CourseSection, SemesterOffering } from "@/modules/courses/semesters";
import type { OfferingPreferences } from "./schema";
export type CandidateOffering = Pick<SemesterOffering, "semester_id" | "semester_name" | "synced_at" | "sections">;
const normalize = (value: string) => value.replace(/\s*\(P\)\s*$/, "").trim().toLocaleLowerCase();
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Every listed meeting of one section must fit; never combine different sections' facts. */
export function sectionMatches(section: CourseSection, preferences: OfferingPreferences): boolean {
  if (preferences.instructors?.length && !preferences.instructors.some((wanted) => section.instructors.some((name) => normalize(name) === normalize(wanted)))) return false;
  if (preferences.attributes?.some((wanted) => !section.attributes.some((value) => normalize(value) === normalize(wanted)))) return false;
  if (!preferences.meeting_days?.length && !preferences.earliest_start && !preferences.latest_end) return true;
  if (!section.sessions.length) return false;
  return section.sessions.every((meeting) => {
    const days = meeting.days.replace(/\s/g, "");
    if (preferences.meeting_days?.length && (!/^[MTWRFSU]+$/.test(days) || [...days].some((day) => !preferences.meeting_days!.some((allowed) => allowed === day)))) return false;
    if (preferences.earliest_start || preferences.latest_end) {
      if (!clock.test(meeting.start) || !clock.test(meeting.end) || meeting.start >= meeting.end) return false;
      if (preferences.earliest_start && meeting.start < preferences.earliest_start) return false;
      if (preferences.latest_end && meeting.end > preferences.latest_end) return false;
    }
    return true;
  });
}

export function matchingOffering(offering: CandidateOffering | undefined, preferences?: OfferingPreferences): CandidateOffering | null {
  if (!preferences?.semester_id) return offering ?? null;
  if (!offering || offering.semester_id !== preferences.semester_id) return null;
  const sections = offering.sections.filter((section) => sectionMatches(section, preferences));
  return sections.length ? { ...offering, sections } : null;
}
