"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { saveMyPreferences, validateCompletedCourses } from "./preferences";
import { readPreferences, parsePreferenceValues, type PreferenceState } from "./schema";

export async function updatePreferences(_previous: PreferenceState, form: FormData): Promise<PreferenceState> {
  const user = await requireUser();
  const values = readPreferences(form);
  const parsed = parsePreferenceValues(values);
  if (!parsed.success) return { status: "error", values, errors: z.flattenError(parsed.error).fieldErrors };
  try {
    const unknown = await validateCompletedCourses(parsed.data);
    if (unknown.length) return { status: "error", values, errors: { completed_course_codes: ["Use course codes from the catalogue, separated by commas."] } };
    await saveMyPreferences(parsed.data);
  } catch {
    log.error("electives.preferences.save_failure", {}, { userId: user.id });
    return { status: "error", values, message: "We couldn't save your preferences. Your draft is still here; please try again." };
  }
  revalidatePath("/electives/preferences");
  return { status: "saved", message: "Preferences saved." };
}
