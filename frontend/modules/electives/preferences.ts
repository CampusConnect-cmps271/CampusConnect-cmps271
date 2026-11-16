import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth";
import { preferencesSchema, type ElectivePreferences } from "./schema";

const COLUMNS = "interests,preferred_workload,academic_goals,completed_course_codes,offering_preferences";
export async function getMyPreferences(): Promise<ElectivePreferences | null> {
  const user = await requireUser();
  const client = await createClient();
  const { data, error } = await client.from("elective_preferences").select(COLUMNS).eq("student_id", user.id).maybeSingle();
  if (error) throw new Error("We couldn't load your elective preferences. Please try again.");
  return data ? preferencesSchema.parse(data) : null;
}
/** Also used by recommendation requests: callers cannot bypass catalogue validation. */
export async function validateCompletedCourses(preferences: ElectivePreferences): Promise<string[]> {
  if (!preferences.completed_course_codes.length) return [];
  const client = await createClient();
  const { data, error } = await client.from("courses").select("code").in("code", preferences.completed_course_codes);
  if (error) throw new Error("The course catalogue is unavailable. Please try again.");
  const known = new Set((data ?? []).map((row: { code: string }) => row.code));
  return preferences.completed_course_codes.filter((code) => !known.has(code));
}
export async function saveMyPreferences(input: unknown) {
  const user = await requireUser();
  const preferences = preferencesSchema.parse(input);
  if ((await validateCompletedCourses(preferences)).length) throw new Error("Some completed courses are not in the catalogue.");
  if (!(await validateOfferingSemester(preferences))) throw new Error("Choose an imported semester.");
  const client = await createClient();
  const { error } = await client.from("elective_preferences").upsert({ ...preferences, offering_preferences: preferences.offering_preferences ?? {}, student_id: user.id }, { onConflict: "student_id" });
  if (error) throw new Error("We couldn't save your preferences. Please try again.");
}

export async function validateOfferingSemester(preferences: ElectivePreferences): Promise<boolean> {
  const semester = preferences.offering_preferences?.semester_id;
  if (!semester) return true;
  const client = await createClient();
  const { data, error } = await client.from("resis_semesters").select("id").eq("id", semester).maybeSingle();
  if (error) throw new Error("Semester data is temporarily unavailable.");
  return data?.id === semester;
}
