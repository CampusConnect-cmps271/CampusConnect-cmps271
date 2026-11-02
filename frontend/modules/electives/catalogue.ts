import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth";
import type { Candidate } from "./types";
import type { ElectivePreferences } from "./schema";
import { preferenceGroups, tokens } from "./preference-matching";

export async function loadCandidates(preferences?: ElectivePreferences): Promise<{ courses: Candidate[]; truncated: boolean }> {
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
  // Search the whole catalogue, but only fetch ratings that can affect ranking.
  // Full course metadata/counts remain available even when no interest matches.
  const groups = preferences ? preferenceGroups(preferences.interests) : null;
  const completed = new Set(preferences?.completed_course_codes ?? []);
  const ratingCandidates = groups ? courses.filter(course => {
    if (completed.has(course.code)) return false;
    const corpus = new Set(tokens(`${course.name} ${course.department} ${course.description}`.slice(0, 20000)));
    return groups.some(group => group.words.every(word => corpus.has(word)));
  }) : courses;
  // Keep ID filters small, but overlap up to four reads instead of serializing
  // one remote round trip per 100 courses. Failed reads retain unknown ratings.
  for (let start = 0; start < ratingCandidates.length; start += 400) {
    await Promise.all(Array.from({ length: 4 }, async (_, index) => {
      const batch = ratingCandidates.slice(start + index * 100, start + (index + 1) * 100);
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
