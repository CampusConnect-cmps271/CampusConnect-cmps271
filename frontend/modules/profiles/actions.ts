"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import {
  readProfileForm,
  validateProfileForm,
  type ProfileFieldErrors,
  type ProfileFormValues,
} from "./schema";

export type ProfileFormState =
  | { status: "idle" }
  | { status: "saved" }
  | {
      status: "error";
      errors?: ProfileFieldErrors;
      /** Form-level message, e.g. the save itself failed. */
      message?: string;
      /** Echoed back so a failed save keeps what was typed. */
      values: ProfileFormValues;
    };

const SAVE_FAILED_MESSAGE = "We couldn't save your profile. Please try again.";

/**
 * Saves the signed-in student's profile. Used with `useActionState`, hence the
 * leading state argument.
 *
 * A Server Action is a public POST endpoint, so it re-validates what the form
 * already checked, and only ever writes the caller's own row.
 */
export async function updateMyProfile(
  _prevState: ProfileFormState | undefined,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const values = readProfileForm(formData);
  const parsed = validateProfileForm(values);

  if (!parsed.success) {
    return { status: "error", errors: parsed.errors, values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      major: parsed.data.major,
      graduation_year: parsed.data.graduationYear,
      bio: parsed.data.bio,
      interests: parsed.data.interests,
    })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    log.error(
      "profiles.update.failure",
      { code: error?.code ?? "no_profile_row" },
      { userId: user.id },
    );
    return { status: "error", message: SAVE_FAILED_MESSAGE, values };
  }

  log.info("profiles.update.success", {}, { userId: user.id });
  revalidatePath("/profile");

  return { status: "saved" };
}
