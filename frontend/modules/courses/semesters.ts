import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";

export type ImportedSemester = { id: string; name: string; synced_at: string };
export type CourseSection = {
  crn: string; section: string; title: string; credits: number;
  instructors: string[]; attributes: string[]; prerequisites: string | null;
  sessions: { days: string; start: string; end: string; type: string; location: string; instructor: string }[];
  campus: string; details_url: string | null; source_updated_at: string | null;
  restrictions: Record<string, unknown> | null;
};
export type SemesterOffering = {
  semester_id: string; semester_name: string; synced_at: string; credits: number;
  instructors: string[]; attributes: string[]; prerequisite_variants: string[];
  sections: CourseSection[]; source_updated_at: string | null;
};

export async function getImportedSemesters(): Promise<ImportedSemester[]> {
  await requireUser();
  const client = await createClient();
  const { data, error } = await client.from("resis_semesters")
    .select("id,name,synced_at").not("synced_at", "is", null).order("id", { ascending: false });
  if (error) throw new Error("Semester options could not be loaded.");
  return data ?? [];
}

export async function getSemesterOfferings(courseId: string, semester?: string): Promise<SemesterOffering[] | null> {
  await requireUser();
  try {
    const client = await createClient();
    let query = client.from("course_semester_catalogue")
      .select("semester_id,semester_name,synced_at,credits,instructors,attributes,prerequisite_variants,sections,source_updated_at")
      .eq("id", courseId);
    if (semester) query = query.eq("semester_id", semester);
    const { data, error } = await query.order("semester_id", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch {
    log.error("courses.semesters.read_failure", { code: "read_failure" });
    return null;
  }
}
