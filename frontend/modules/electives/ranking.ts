import type { ElectivePreferences } from "./schema";
import type { Candidate, PrerequisiteStatus, Recommendation } from "./types";
import { registrationGuidance } from "./registration";

export const RECOMMENDATION_LIMIT = 20;

/** Only decide simple explicit course requirements. Prose and AND/OR combinations remain unknown. */
export function prerequisiteStatus(prose: string, completed: string[]): PrerequisiteStatus {
  const text = prose.trim().replace(/^prerequisites?\s*:\s*/i, "").replace(/[.]$/, "").trim();
  if (/^(none|no prerequisites)$/i.test(text)) return "satisfied";
  const code = "[A-Z]{2,8}\\s+[0-9]{3}[A-Z]{0,3}";
  if (!new RegExp(`^${code}(?:\\s+and\\s+${code})*$`, "i").test(text)) return "unknown";
  const codes = text.toUpperCase().split(/\s+AND\s+/);
  return codes.every(c => completed.includes(c.replace(/\s+/g, " "))) ? "satisfied" : "unmet";
}
const tokens = (text: string) => [...new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
export function rankCandidates(courses: Candidate[], preferences: ElectivePreferences, limit = RECOMMENDATION_LIMIT, major: string | null = null): Recommendation[] {
  const interests = tokens(preferences.interests.join(" ")).slice(0, 40);
  const goals = tokens(preferences.academic_goals).slice(0, 40);
  const workload = { light: 1.5, moderate: 3, heavy: 4.5 }[preferences.preferred_workload];
  return courses.filter(c => !preferences.completed_course_codes.includes(c.code)).map(course => {
    const corpus = new Set(tokens(`${course.name} ${course.department} ${course.description}`.slice(0, 20000)));
    const matches = interests.filter(word => corpus.has(word));
    const goalMatches = goals.filter(word => corpus.has(word));
    const status = prerequisiteStatus(course.prerequisites, preferences.completed_course_codes);
    const registration = registrationGuidance(course, major);
    const hasRatings = course.review_count !== null && course.review_count >= 3;
    const workloadFit = hasRatings && course.average_workload !== null ? 5 - Math.abs(course.average_workload - workload) : 0;
    const score = (status === "unmet" ? -1000 : 0) + (registration.status === "restricted" ? -1000 : 0) + matches.length * 5 + goalMatches.length + workloadFit + (hasRatings ? (course.average_overall ?? 0) / 5 : 0);
    const rationale = [matches.length ? `Catalogue matches: ${matches.join(", ")}.` : "A catalogue option to explore; no direct interest match was found.",
      hasRatings ? `Workload fit uses ${course.review_count} published reviews.` : course.review_count === null ? "Review ratings are unavailable; workload fit is unknown." : "Too few reviews to assess workload reliably.",
      status === "unknown" ? "Prerequisites need manual verification." : status === "unmet" ? "Your self-reported courses do not meet the listed requirements." : "Listed requirements match your self-reported courses."].join(" ");
    return { score, result: { course_id: course.id, code: course.code, name: course.name, department: course.department, rationale, evidence_review_ids: [], registration,
      prerequisite_status: status, prerequisites: course.prerequisites, review_count: course.review_count } satisfies Recommendation };
  }).sort((a, b) => b.score - a.score || a.result.code.localeCompare(b.result.code)).slice(0, limit).map(row => row.result);
}
