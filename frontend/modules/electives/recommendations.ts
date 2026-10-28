import "server-only";
import { z } from "zod";
import { preferencesSchema } from "./schema";
import { rankCandidates } from "./ranking";
import type { Candidate, Recommendation } from "./types";
import type { Provider } from "./provider";

const responseSchema = z.object({ items: z.array(z.object({ course_id: z.string().max(64), rationale: z.string().trim().min(1).max(800), evidence_review_ids: z.array(z.string().max(64)).max(10) }).strict()).min(1).max(8) }).strict();
export type RecommendationResult = { recommendations: Recommendation[]; mode: "provider" | "baseline"; providerStatus: "available" | "unconfigured" | "failed"; truncated: boolean };
/** Pure dependencies allow deterministic tests without a form or a real provider. */
export async function recommend(input: unknown, catalogue: { courses: Candidate[]; truncated: boolean }, provider?: Provider): Promise<RecommendationResult> {
  const preferences = preferencesSchema.parse(input);
  const baseline = rankCandidates(catalogue.courses, preferences);
  const fallback = (status: RecommendationResult["providerStatus"]): RecommendationResult => ({ recommendations: baseline, mode: "baseline", providerStatus: status, truncated: catalogue.truncated });
  if (!provider || !baseline.length) return fallback("unconfigured");
  try {
    const result = responseSchema.parse(await provider("recommend", { preferences, candidates: baseline,
      response_schema: { items: [{ course_id: "supplied candidate id", rationale: "bounded catalogue-grounded explanation", evidence_review_ids: [] }] } }));
    const ids = result.items.map(item => item.course_id);
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate candidate");
    const recommendations = result.items.map(item => {
      const source = baseline.find(row => row.course_id === item.course_id);
      // This operation uses catalogue data only. Review enrichment is a separate bounded request.
      if (!source || item.evidence_review_ids.length) throw new Error("Unsupported course or citation");
      return { ...source, rationale: item.rationale };
    });
    return { recommendations, mode: "provider", providerStatus: "available", truncated: catalogue.truncated };
  } catch { return fallback("failed"); }
}
