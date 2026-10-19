"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";
import { checkContentRestrictions } from "@/modules/moderation/restrictions";
import { courseUrl } from "@/modules/courses/references";
import { deleteReviewSchema, formText, readReviewForm, reviewSchema } from "./schema";
import type { ReviewState } from "./types";

const failed = (message: string): ReviewState => ({ status: "error", message });
const RETRY = "We couldn't save your review. Your changes are still here; please try again.";
const STALE = "This review changed or is no longer available. Refresh the page before trying again.";

export async function saveMyReview(_previous: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse(readReviewForm(formData));
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return { status: "error", errors, message: "Check the highlighted fields. If the page is out of date, refresh it." };
  }
  const value = parsed.data;
  let code: string;
  try {
    const client = await createClient();
    const course = await client.from("courses").select("id,code").eq("id", value.courseId).maybeSingle<{ id: string; code: string }>();
    if (course.error) {
      log.error("reviews.course.failure", { code: course.error.code });
      return failed(RETRY);
    }
    if (!course.data) return failed("This course is no longer available.");
    code = course.data.code;

    const restriction = await checkContentRestrictions({
      userId: user.id, contentType: "review", body: value.body, excludeId: value.reviewId || undefined,
    });
    if (!restriction.allowed) {
      log.warn("reviews.restricted", { rule: restriction.rule }, { userId: user.id });
      return failed(restriction.message);
    }
    const payload = {
      difficulty_rating: value.difficulty, workload_rating: value.workload,
      usefulness_rating: value.usefulness, overall_rating: value.overall,
      semester_taken: value.semester, body: value.body, completed_course: value.completedCourse,
    };
    const query = value.reviewId
      ? client.from("course_reviews").update(payload).eq("id", value.reviewId)
        .eq("course_id", value.courseId).eq("student_id", user.id).eq("updated_at", value.updatedAt)
      : client.from("course_reviews").insert({ ...payload, course_id: value.courseId, student_id: user.id });
    const { data, error } = await query.select("id").maybeSingle<{ id: string }>();
    if (error) {
      log.error("reviews.save.failure", { code: error.code }, { userId: user.id });
      if (error.code === "23505") return failed("You already have a review for this course. Refresh the page to edit it.");
      if (error.code === "42501") return failed("You don't have permission to save this review.");
      return failed(RETRY);
    }
    if (!data) return failed(STALE);
  } catch {
    log.error("reviews.save.failure", { code: "connection_failure" }, { userId: user.id });
    return failed(RETRY);
  }
  revalidatePath(courseUrl(code));
  revalidatePath("/courses/[code]", "page");
  revalidatePath("/courses");
  return { status: "saved", message: "Your review has been saved." };
}

export async function deleteMyReview(_previous: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await requireUser();
  const parsed = deleteReviewSchema.safeParse({
    courseId: formText(formData, "courseId"), reviewId: formText(formData, "reviewId"),
    updatedAt: formText(formData, "updatedAt"), confirmDelete: formText(formData, "confirmDelete"),
  });
  if (!parsed.success) return failed("Confirm deletion, or refresh the page if the review has changed.");
  let code: string;
  try {
    const client = await createClient();
    const course = await client.from("courses").select("id,code").eq("id", parsed.data.courseId).maybeSingle<{ id: string; code: string }>();
    if (course.error || !course.data) return failed("The course could not be checked. Refresh the page and try again.");
    code = course.data.code;
    const { data, error } = await client.from("course_reviews").delete().eq("id", parsed.data.reviewId)
      .eq("course_id", parsed.data.courseId).eq("student_id", user.id).eq("updated_at", parsed.data.updatedAt)
      .select("id").maybeSingle<{ id: string }>();
    if (error) {
      log.error("reviews.delete.failure", { code: error.code }, { userId: user.id });
      return failed("We couldn't delete your review. Please try again.");
    }
    if (!data) return failed(STALE);
  } catch {
    log.error("reviews.delete.failure", { code: "connection_failure" }, { userId: user.id });
    return failed("We couldn't delete your review. Please try again.");
  }
  revalidatePath(courseUrl(code));
  revalidatePath("/courses/[code]", "page");
  revalidatePath("/courses");
  return { status: "deleted", message: "Your review has been deleted." };
}
