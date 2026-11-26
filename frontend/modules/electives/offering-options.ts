import "server-only";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { getImportedSemesters, type ImportedSemester } from "@/modules/courses/semesters";

export type OfferingOptions = { semesters: ImportedSemester[]; instructors: Record<string, string[]>; attributes: Record<string, string[]>; unavailable?: boolean };
export async function getOfferingOptions(): Promise<OfferingOptions> {
  await requireUser();
  try {
    const client = await createClient();
    const semesters = await getImportedSemesters();
    const instructors: Record<string, Set<string>> = {};
    const attributes: Record<string, Set<string>> = {};
    for (let start = 0; ; start += 1000) {
      const { data, error } = await client.from("course_semester_catalogue").select("id,semester_id,instructors,attributes")
        .order("semester_id").order("id").range(start, start + 999);
      if (error) throw error;
      for (const row of data ?? []) {
        instructors[row.semester_id] ??= new Set(); attributes[row.semester_id] ??= new Set();
        for (const name of row.instructors ?? []) if (name !== "TBA") instructors[row.semester_id].add(name);
        for (const name of row.attributes ?? []) attributes[row.semester_id].add(name);
      }
      if ((data ?? []).length < 1000) break;
    }
    const lists = (value: Record<string, Set<string>>) => Object.fromEntries(Object.entries(value).map(([key, names]) => [key, [...names].sort()]));
    return { semesters, instructors: lists(instructors), attributes: lists(attributes) };
  } catch { return { semesters: [], instructors: {}, attributes: {}, unavailable: true }; }
}
