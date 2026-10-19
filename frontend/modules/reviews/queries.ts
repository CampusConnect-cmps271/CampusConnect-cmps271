import "server-only";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";
import type { MyReview } from "./types";

export const REVIEW_COLUMNS = "id,course_id,difficulty_rating,workload_rating,usefulness_rating,overall_rating,body,semester_taken,completed_course,updated_at";

export async function getMyReview(courseId: string) {
  const user = await requireUser();
  try {
    const client = await createClient();
    const { data, error } = await client.from("course_reviews").select(REVIEW_COLUMNS)
      .eq("course_id", courseId).eq("student_id", user.id).maybeSingle<MyReview>();
    if (error) {
      log.error("reviews.read.failure", { code: error.code });
      return { available: false as const, review: null };
    }
    return { available: true as const, review: data };
  } catch {
    log.error("reviews.read.failure", { code: "connection_failure" });
    return { available: false as const, review: null };
  }
}
