import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth";
import type { Candidate } from "./types";

export async function loadCandidates(): Promise<{ courses: Candidate[]; truncated: boolean }> {
  await requireUser();
  const client = await createClient();
  const courses: Candidate[] = [];
  const PAGE = 1000;
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await client.from("courses").select("id,code,name,description,department,prerequisites,credits")
      .order("code").range(start, start + PAGE - 1);
    if (error) throw new Error("The course catalogue is temporarily unavailable.");
    courses.push(...(data ?? []).map(row => ({ ...row, review_count: null, average_workload: null, average_overall: null })) as Candidate[]);
    if ((data ?? []).length < PAGE) break;
  }
  // Keep ID filters small, but overlap up to four reads instead of serializing
  // one remote round trip per 100 courses. Failed reads retain unknown ratings.
  for (let start = 0; start < courses.length; start += 400) {
    await Promise.all(Array.from({ length: 4 }, async (_, index) => {
      const batch = courses.slice(start + index * 100, start + (index + 1) * 100);
      if (!batch.length) return;
      try {
        const { data, error } = await client.from("course_rating_averages").select("course_id,review_count,average_workload,average_overall").in("course_id", batch.map(c => c.id));
        if (error) return;
        const ratings = new Map(data?.map(row => [row.course_id, row]));
        for (const course of batch) {
          const rating = ratings.get(course.id);
          if (rating) Object.assign(course, { review_count: Number(rating.review_count), average_workload: rating.average_workload === null ? null : Number(rating.average_workload), average_overall: rating.average_overall === null ? null : Number(rating.average_overall) });
        }
      } catch {
        // Optional ratings must not prevent catalogue-based recommendations.
      }
    }));
  }
  return { courses, truncated: false };
}
