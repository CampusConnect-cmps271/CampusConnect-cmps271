import "server-only";
import { z } from "zod";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";
import { ratingRowSchema, summarizeRating, type RatingSummary } from "./model";

const COLUMNS = "course_id,review_count,average_difficulty,average_workload,average_usefulness,average_overall";

export async function getCourseRatings(courseIds: string[]): Promise<Map<string, RatingSummary>> {
  // Keep authentication interrupts outside the failure fallback.
  await requireUser();
  const ids = [...new Set(courseIds)];
  const summaries = new Map<string, RatingSummary>(ids.map((id) => [id, { status: "unavailable" }]));
  if (ids.length === 0) return summaries;
  try {
    const client = await createClient();
    // A catalogue page needs one batch. Bound URLs if a future caller needs more.
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      const { data, error } = await client.from("course_rating_averages").select(COLUMNS).in("course_id", batch);
      if (error) {
        log.error("ratings.read_failure", { code: error.code });
        continue;
      }
      const parsed = z.array(ratingRowSchema).safeParse(data);
      if (!parsed.success) {
        log.error("ratings.read_failure", { code: "invalid_data" });
        continue;
      }
      for (const row of parsed.data) {
        if (batch.includes(row.course_id)) summaries.set(row.course_id, summarizeRating(row));
      }
    }
  } catch {
    log.error("ratings.read_failure", { code: "connection_failure" });
  }
  // Missing rows stay unavailable: no row is different from a zero-review row.
  return summaries;
}
