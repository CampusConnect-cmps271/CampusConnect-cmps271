import { z } from "zod";

export const MIN_RATING_REVIEWS = 3;
export const RATING_DIMENSIONS = [
  ["average_difficulty", "Difficulty"],
  ["average_workload", "Workload"],
  ["average_usefulness", "Usefulness"],
  ["average_overall", "Overall experience"],
] as const;
type Dimension = typeof RATING_DIMENSIONS[number][0];

// PostgREST normally sends numbers; also accept numeric/bigint string values.
// Reject null/blank/boolean coercions instead of inventing zero ratings/counts.
const numeric = z.union([z.number(), z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number)]);
const average = numeric.pipe(z.number().min(1).max(5)).nullable();
export const ratingRowSchema = z.object({
  course_id: z.uuid(),
  review_count: numeric.pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
  average_difficulty: average,
  average_workload: average,
  average_usefulness: average,
  average_overall: average,
}).refine((row) => RATING_DIMENSIONS.every(([key]) =>
  row.review_count === 0 ? row[key] === null : row[key] !== null,
), { message: "Review count and averages are inconsistent." });

export type RatingRow = z.infer<typeof ratingRowSchema>;
export type RatingSummary =
  | { status: "unavailable" }
  | { status: "insufficient"; reviewCount: number }
  | { status: "ready"; reviewCount: number; averages: Record<Dimension, number> };

export function summarizeRating(row: RatingRow): RatingSummary {
  if (row.review_count < MIN_RATING_REVIEWS) {
    return { status: "insufficient", reviewCount: row.review_count };
  }
  const { average_difficulty, average_workload, average_usefulness, average_overall } = row;
  if (average_difficulty === null || average_workload === null || average_usefulness === null || average_overall === null) {
    return { status: "unavailable" };
  }
  return {
    status: "ready", reviewCount: row.review_count,
    averages: { average_difficulty, average_workload, average_usefulness, average_overall },
  };
}

const displayRating = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatRating = (value: number) => displayRating.format(value);
