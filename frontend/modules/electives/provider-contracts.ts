import { z } from "zod";
import { RECOMMENDATION_LIMIT } from "./ranking";

// Shared by provider requests and the service's final validation.
export const recommendationResponseSchema = z.object({ items: z.array(z.object({
  course_id: z.string().max(64),
  rationale: z.string().trim().min(1).max(800),
  evidence_review_ids: z.array(z.string().max(64)).max(0),
}).strict()).min(1).max(RECOMMENDATION_LIMIT) }).strict();

export const analysisStageSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  uncertainty: z.string().trim().min(1).max(500),
  claims: z.array(z.object({
    review_id: z.string().max(64),
    quote: z.string().trim().min(1).max(500),
    observation: z.string().trim().min(1).max(500),
  }).strict()).max(8),
}).strict();
