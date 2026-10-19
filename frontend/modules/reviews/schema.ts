import { z } from "zod";

export const RATING_FIELDS = ["difficulty", "workload", "usefulness", "overall"] as const;
export const RATING_LABELS = {
  difficulty: "Difficulty", workload: "Workload", usefulness: "Usefulness", overall: "Overall experience",
} as const;
export const EMPTY_REVIEW_VALUES = {
  difficulty: "", workload: "", usefulness: "", overall: "", semester: "", body: "", completedCourse: false,
};
export type ReviewValues = typeof EMPTY_REVIEW_VALUES;
const rating = z.string().regex(/^[1-5]$/, "Choose a whole-number rating from 1 to 5.").transform(Number);
const id = z.uuid({ error: "The review information is invalid. Refresh the page and try again." });
const version = z.iso.datetime({ offset: true, error: "Refresh the page before changing this review." });

export const reviewSchema = z.object({
  courseId: id,
  reviewId: z.union([id, z.literal("")]),
  updatedAt: z.union([version, z.literal("")]),
  difficulty: rating, workload: rating, usefulness: rating, overall: rating,
  semester: z.string().trim().min(1, "Enter the semester you took this course.").max(80, "Use 80 characters or fewer."),
  body: z.string().trim().min(1, "Write a review before submitting.").max(5000, "Use 5,000 characters or fewer."),
  completedCourse: z.literal(true, { error: "Confirm that you completed this course." }),
}).superRefine((value, context) => {
  if (Boolean(value.reviewId) !== Boolean(value.updatedAt)) {
    context.addIssue({ code: "custom", path: ["reviewId"], message: "Refresh the page before changing this review." });
  }
});

export const deleteReviewSchema = z.object({
  courseId: id, reviewId: id, updatedAt: version,
  confirmDelete: z.literal("yes", { error: "Confirm deletion before continuing." }),
});

export const formText = (data: FormData, field: string) => {
  const value = data.get(field);
  return typeof value === "string" ? value : "";
};

export function readReviewForm(data: FormData) {
  return {
    courseId: formText(data, "courseId"), reviewId: formText(data, "reviewId"), updatedAt: formText(data, "updatedAt"),
    difficulty: formText(data, "difficulty"), workload: formText(data, "workload"),
    usefulness: formText(data, "usefulness"), overall: formText(data, "overall"),
    semester: formText(data, "semester"), body: formText(data, "body"),
    completedCourse: data.get("completedCourse") === "on",
  };
}
