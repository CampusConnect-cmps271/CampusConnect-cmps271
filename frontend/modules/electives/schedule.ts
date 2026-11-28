import "server-only";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { plannerIdSchema } from "@/modules/planner/schema";

export type ScheduleCourse = { id: string; code: string; name: string; semester_id: string; semester_name: string };
/** Read the authoritative imported offering, never course facts supplied by a browser. */
export async function getScheduleCourse(courseId: string, semesterId: string): Promise<ScheduleCourse | null> {
  await requireUser();
  if (!plannerIdSchema.safeParse(courseId).success || !/^\d{6}$/.test(semesterId)) return null;
  const client = await createClient();
  const { data, error } = await client.from("course_semester_catalogue")
    .select("id,code,name,semester_id,semester_name").eq("id", courseId).eq("semester_id", semesterId).limit(1);
  if (error) throw new Error("The elective could not be loaded. Please try again.");
  return data?.[0] ?? null;
}
