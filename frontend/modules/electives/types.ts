export type PrerequisiteStatus = "satisfied" | "unmet" | "unknown";
export type Candidate = {
  id: string; code: string; name: string; description: string; department: string; prerequisites: string; credits: number;
  review_count: number | null; average_workload: number | null; average_overall: number | null;
};
export type Recommendation = {
  course_id: string; code: string; name: string; department: string; rationale: string; evidence_review_ids: string[];
  prerequisite_status: PrerequisiteStatus; prerequisites: string; review_count: number | null;
  registration: { status: "unverified" | "review_required" | "restricted"; message: string; evidence?: string };
};
export type StudentContext = { major: string | null; majorStatus: "known" | "missing" | "unavailable" };
export type ReviewEvidence = { id: string; course_id: string; body: string; overall_rating: number; workload_rating: number };
