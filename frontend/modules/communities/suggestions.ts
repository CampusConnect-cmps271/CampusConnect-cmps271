import { TOPIC_LABELS } from "./schema";
import type { CommunitySummary, Suggestion } from "./types";

/** One of the student's current or upcoming semester plans. */
export type SuggestionPlan = {
  term: string;
  courses: readonly { courseId: string; code: string }[];
};

export const MAX_SUGGESTIONS = 6;
/** Shorter interests ("AI" is fine, "a" is not) would match too much. */
const MIN_INTEREST_LENGTH = 2;

function normalize(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether a community fits an interest: its topic is the interest
 * ("Housing"), or its name has the interest as whole words ("Chess" in
 * "Chess & Coffee", but "art" not in "Party planning").
 */
export function matchesInterest(community: Pick<CommunitySummary, "name" | "topic">, interest: string): boolean {
  const needle = normalize(interest);
  if (needle.length < MIN_INTEREST_LENGTH) return false;
  if (normalize(TOPIC_LABELS[community.topic]) === needle) return true;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?:$|[^\\p{L}\\p{N}])`, "u").test(normalize(community.name));
}

/**
 * Communities to suggest, each with a short reason: course communities for
 * courses in the student's plans first (in plan order), then communities
 * matching their profile interests, most members first. Candidates the
 * student already joined or follows should be left out by the caller.
 */
export function suggestCommunities({
  plans,
  interests,
  candidates,
  limit = MAX_SUGGESTIONS,
}: {
  plans: readonly SuggestionPlan[];
  interests: readonly string[];
  candidates: readonly CommunitySummary[];
  limit?: number;
}): Suggestion[] {
  const courseReasons = new Map<string, { reason: string; rank: number }>();
  for (const plan of plans) {
    for (const course of plan.courses) {
      if (!courseReasons.has(course.courseId)) {
        courseReasons.set(course.courseId, {
          reason: `${course.code} is in your ${plan.term} plan`,
          rank: courseReasons.size,
        });
      }
    }
  }

  const ranked: (Suggestion & { rank: number })[] = [];
  const seen = new Set<string>();
  for (const community of candidates) {
    if (community.status !== "active" || seen.has(community.id)) continue;
    const byCourse = community.courseId ? courseReasons.get(community.courseId) : undefined;
    if (byCourse) {
      ranked.push({ community, reason: byCourse.reason, rank: byCourse.rank });
      seen.add(community.id);
      continue;
    }
    const interest = interests.find((candidate) => matchesInterest(community, candidate));
    if (interest) {
      ranked.push({ community, reason: `Matches your interest: ${interest.trim()}`, rank: Number.MAX_SAFE_INTEGER });
      seen.add(community.id);
    }
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || b.community.memberCount - a.community.memberCount || a.community.name.localeCompare(b.community.name))
    .slice(0, limit)
    .map(({ community, reason }) => ({ community, reason }));
}
