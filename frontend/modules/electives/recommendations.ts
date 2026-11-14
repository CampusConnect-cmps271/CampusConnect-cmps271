import "server-only";
import { recommendationResponseSchema } from "./provider-contracts";
import { preferencesSchema } from "./schema";
import { rankCandidates, RECOMMENDATION_LIMIT } from "./ranking";
import type { Candidate, Recommendation, StudentContext } from "./types";
import type { Provider } from "./provider";

export type RecommendationResult = { recommendations: Recommendation[]; mode: "provider" | "baseline"; providerStatus: "available" | "unconfigured" | "failed" | "not_needed"; truncated: boolean; catalogueCount: number; studentMajor: string | null; majorStatus: StudentContext["majorStatus"] };
/** Pure dependencies allow deterministic tests without a form or a real provider. */
export async function recommend(input: unknown, catalogue: { courses: Candidate[]; truncated: boolean; catalogueCount?: number }, provider?: Provider, context: StudentContext = { major: null, majorStatus: "missing" }, onTiming?: (stage: "ranking" | "provider", ms: number) => void): Promise<RecommendationResult> {
  const preferences = preferencesSchema.parse(input);
  const rankingStarted = performance.now();
  const baseline = rankCandidates(catalogue.courses, preferences, RECOMMENDATION_LIMIT, context.major);
  onTiming?.("ranking", performance.now() - rankingStarted);
  onTiming?.("provider", 0);
  const metadata = { truncated: catalogue.truncated, catalogueCount: catalogue.catalogueCount ?? catalogue.courses.length, studentMajor: context.major, majorStatus: context.majorStatus };
  const fallback = (status: RecommendationResult["providerStatus"]): RecommendationResult => ({ recommendations: baseline, mode: "baseline", providerStatus: status, ...metadata });
  if (!provider) return fallback("unconfigured");
  if (!baseline.length) return fallback("not_needed");
  const providerStarted = performance.now();
  try {
    const result = recommendationResponseSchema.parse(await provider("recommend", { preferences, candidates: baseline.map(({ offering, ...candidate }) => ({ ...candidate,
      ...(offering ? { semester: offering.semester_name, matching_sections: offering.sections.length } : {}),
    })),
      response_schema: { items: [{ course_id: "supplied candidate id", rationale: "bounded catalogue-grounded explanation", evidence_review_ids: [] }] } }));
    const ids = result.items.map(item => item.course_id);
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate candidate");
    const recommendations = result.items.map(item => {
      const source = baseline.find(row => row.course_id === item.course_id);
      // This operation uses catalogue data only. Review enrichment is a separate bounded request.
      if (!source || item.evidence_review_ids.length) throw new Error("Unsupported course or citation");
      return { ...source, rationale: item.rationale };
    });
    // Partial provider output must not reduce the requested twenty results.
    recommendations.push(...baseline.filter(row => !ids.includes(row.course_id)));
    return { recommendations, mode: "provider", providerStatus: "available", ...metadata };
  } catch { return fallback("failed"); }
  finally { onTiming?.("provider", performance.now() - providerStarted); }
}
