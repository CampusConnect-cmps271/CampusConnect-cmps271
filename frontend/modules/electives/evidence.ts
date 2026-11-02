import "server-only";
import { z } from "zod";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReviewEvidence } from "./types";

export type EvidenceSample = {
  reviews: ReviewEvidence[]; total: number; sampled: number; truncated: boolean;
  positive: number; negative: number; mixed: number;
};
/** Classifications describe star ratings, not a model's interpretation of the prose. */
export function summarizeEvidence(reviews: ReviewEvidence[], total: number): EvidenceSample {
  return { reviews, total, sampled: reviews.length, truncated: total > reviews.length,
    positive: reviews.filter(r => r.overall_rating >= 4).length,
    negative: reviews.filter(r => r.overall_rating <= 2).length,
    mixed: reviews.filter(r => r.overall_rating === 3).length };
}
export async function loadEvidence(courseId: string): Promise<EvidenceSample> {
  await requireUser(); z.uuid().parse(courseId);
  const client = await createClient();
  // RLS plus an explicit status filter exclude removed and private evidence.
  // Selecting only these columns prevents student identifiers reaching an AI provider.
  const { data, error, count } = await client.from("course_reviews")
    .select("id,course_id,body,overall_rating,workload_rating", { count: "exact" })
    .eq("course_id", courseId).eq("status", "published")
    .order("created_at", { ascending: false }).order("id").limit(24);
  if (error) throw new Error("Published review evidence is temporarily unavailable.");
  const reviews = (data ?? []).map(row => ({ id: row.id, course_id: row.course_id, body: String(row.body).slice(0, 1500), overall_rating: Number(row.overall_rating), workload_rating: Number(row.workload_rating) }));
  return summarizeEvidence(reviews, count ?? reviews.length);
}
