import type { ReviewValues } from "./schema";

export type MyReview = {
  id: string; course_id: string; updated_at: string; semester_taken: string; body: string;
  difficulty_rating: number; workload_rating: number; usefulness_rating: number; overall_rating: number;
  completed_course: boolean; status: "published" | "removed";
};
export type CourseReview = MyReview & { student_id: string; created_at: string };
export type ReviewState = {
  status: "idle" | "error" | "saved" | "deleted";
  message?: string;
  errors?: Partial<Record<keyof ReviewValues, string[]>>;
};
