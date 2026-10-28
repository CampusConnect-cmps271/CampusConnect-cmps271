import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth";
import type { Candidate } from "./types";

export async function loadCandidates(): Promise<{ courses: Candidate[]; truncated: boolean }> {
  await requireUser();
  const client = await createClient();
  const courses: Candidate[] = [];
  const PAGE = 200, CAP = 5000;
  let truncated = false;
  for (let start = 0; start <= CAP; start += PAGE) {
    const { data, error } = await client.from("courses").select("id,code,name,description,department,prerequisites,credits")
      .order("code").range(start, start + PAGE - 1);
    if (error) throw new Error("The course catalogue is temporarily unavailable.");
    if (start === CAP) { truncated = Boolean(data?.length); break; }
    courses.push(...(data ?? []).map(row => ({ ...row, review_count: 0, average_workload: null, average_overall: null })) as Candidate[]);
    if ((data ?? []).length < PAGE) break;
  }
  // Failed rating reads leave an honest no-ratings baseline; never fabricate averages.
  for (let start = 0; start < courses.length; start += 100) {
    const batch = courses.slice(start, start + 100);
    const { data, error } = await client.from("course_rating_averages").select("course_id,review_count,average_workload,average_overall").in("course_id", batch.map(c => c.id));
    if (error) continue;
    for (const course of batch) {
      const rating = data?.find(row => row.course_id === course.id);
      if (rating) Object.assign(course, { review_count: Number(rating.review_count), average_workload: rating.average_workload === null ? null : Number(rating.average_workload), average_overall: rating.average_overall === null ? null : Number(rating.average_overall) });
    }
  }
  return { courses, truncated };
}
