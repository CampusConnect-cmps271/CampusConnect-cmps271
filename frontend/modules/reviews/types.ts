import type { ReviewValues } from "./schema";

export type MyReview = {
  id: string; course_id: string; updated_at: string; semester_taken: string; body: string;
  difficulty_rating: number; workload_rating: number; usefulness_rating: number; overall_rating: number;
  completed_course: boolean;
};
export type ReviewState = {
  status: "idle" | "error" | "saved" | "deleted";
  message?: string;
  errors?: Partial<Record<keyof ReviewValues, string[]>>;
};
