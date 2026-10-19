import { describe, expect, it } from "vitest";
import { deleteReviewSchema, readReviewForm, reviewSchema } from "./schema";

const valid = {
  courseId: "10000000-0000-4000-8000-000000000001", reviewId: "", updatedAt: "",
  difficulty: "2", workload: "3", usefulness: "5", overall: "4",
  semester: " Fall 2026 ", body: " Useful projects.\n\nClear examples. ", completedCourse: true,
};

describe("review form validation", () => {
  it("converts only valid whole-number ratings and trims text while preserving paragraphs", () => {
    expect(reviewSchema.parse(valid)).toMatchObject({
      difficulty: 2, workload: 3, usefulness: 5, overall: 4,
      semester: "Fall 2026", body: "Useful projects.\n\nClear examples.",
    });
  });
  it.each(["", "0", "6", "2.5", "NaN", "Infinity", "1e0", "01"])("rejects an invalid rating %s", (rating) => {
    for (const field of ["difficulty", "workload", "usefulness", "overall"]) {
      expect(reviewSchema.safeParse({ ...valid, [field]: rating }).success).toBe(false);
    }
  });
  it("rejects blank/long text and missing confirmation", () => {
    for (const fields of [{ body: " \n\t " }, { body: "x".repeat(5001) }, { semester: " " },
      { semester: "x".repeat(81) }, { completedCourse: false }, { courseId: "invalid" }]) {
      expect(reviewSchema.safeParse({ ...valid, ...fields }).success).toBe(false);
    }
    expect(reviewSchema.safeParse({ ...valid, body: "x".repeat(5000), semester: "x".repeat(80) }).success).toBe(true);
  });
  it("requires a valid row version for edits and rejects half-specified edit identifiers", () => {
    const edit = { ...valid, reviewId: "20000000-0000-4000-8000-000000000001", updatedAt: "2026-10-18T12:30:00.123456+00:00" };
    expect(reviewSchema.safeParse(edit).success).toBe(true);
    expect(reviewSchema.safeParse({ ...edit, updatedAt: "" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...edit, reviewId: "" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...edit, updatedAt: "yesterday" }).success).toBe(false);
  });
  it("reads only expected form fields and requires the actual checkbox value", () => {
    const data = new FormData();
    for (const [field, value] of Object.entries(valid)) data.set(field, String(value));
    data.set("completedCourse", "false");
    data.set("student_id", "not-the-student");
    expect(readReviewForm(data).completedCourse).toBe(false);
    expect(readReviewForm(data)).not.toHaveProperty("student_id");
    data.set("completedCourse", "on");
    expect(readReviewForm(data).completedCourse).toBe(true);
    data.set("body", new Blob(["file"]), "review.txt");
    expect(readReviewForm(data).body).toBe("");
  });
  it("requires explicit deletion confirmation and valid identifiers", () => {
    const deletion = { courseId: valid.courseId, reviewId: "20000000-0000-4000-8000-000000000001", updatedAt: "2026-10-18T12:30:00Z", confirmDelete: "yes" };
    expect(deleteReviewSchema.safeParse(deletion).success).toBe(true);
    expect(deleteReviewSchema.safeParse({ ...deletion, confirmDelete: "" }).success).toBe(false);
    expect(deleteReviewSchema.safeParse({ ...deletion, reviewId: "" }).success).toBe(false);
  });
});
