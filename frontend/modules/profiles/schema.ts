import * as z from "zod";

/**
 * Profile limits, matching the checks in the profiles migration
 * (20261014100000_create_profiles.sql). The database has the final say; these
 * let the form explain a problem before the row is rejected.
 */
export const PROFILE_LIMITS = {
  fullName: 100,
  major: 100,
  bio: 500,
  interests: 10,
  interest: 40,
  firstGraduationYear: 2020,
  lastGraduationYear: 2035,
} as const;

const GRADUATION_YEAR_MESSAGE = `Enter a year between ${PROFILE_LIMITS.firstGraduationYear} and ${PROFILE_LIMITS.lastGraduationYear}`;

/** Text a form field holds. A missing field reads as empty. */
const formText = z
  .unknown()
  .transform((value) => (typeof value === "string" ? value : ""));

function optionalText(max: number, label: string) {
  return formText
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .max(max, `${label} must be ${max} characters or fewer`)
        .transform((value) => (value === "" ? null : value)),
    );
}

/**
 * Splits the comma-separated interests field into tags: trimmed, empty ones
 * dropped, duplicates (ignoring case) removed.
 */
export function parseInterests(value: string): string[] {
  const seen = new Set<string>();
  const interests: string[] = [];

  for (const raw of value.split(",")) {
    const interest = raw.trim().replace(/\s+/g, " ");
    const key = interest.toLowerCase();
    if (interest === "" || seen.has(key)) continue;
    seen.add(key);
    interests.push(interest);
  }

  return interests;
}

/**
 * The editable profile, read from the profile form. Shared by the form, which
 * checks before submitting, and the server action, which checks again because
 * anyone can POST to it.
 */
export const profileFormSchema = z.object({
  fullName: formText
    .transform((value) => value.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, "Full name is required")
        .max(
          PROFILE_LIMITS.fullName,
          `Full name must be ${PROFILE_LIMITS.fullName} characters or fewer`,
        ),
    ),
  major: optionalText(PROFILE_LIMITS.major, "Major"),
  graduationYear: formText
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .refine(
          (value) =>
            value === "" ||
            (/^\d{4}$/.test(value) &&
              Number(value) >= PROFILE_LIMITS.firstGraduationYear &&
              Number(value) <= PROFILE_LIMITS.lastGraduationYear),
          GRADUATION_YEAR_MESSAGE,
        )
        .transform((value) => (value === "" ? null : Number(value))),
    ),
  bio: optionalText(PROFILE_LIMITS.bio, "Bio"),
  interests: formText.transform(parseInterests).pipe(
    z
      .array(
        z
          .string()
          .max(
            PROFILE_LIMITS.interest,
            `Each interest must be ${PROFILE_LIMITS.interest} characters or fewer`,
          ),
      )
      .max(
        PROFILE_LIMITS.interests,
        `Add up to ${PROFILE_LIMITS.interests} interests`,
      ),
  ),
});

export type ProfileInput = z.output<typeof profileFormSchema>;

/** The form's raw text, echoed back so a failed save keeps what was typed. */
export type ProfileFormValues = Record<keyof ProfileInput, string>;

export type ProfileFieldErrors = Partial<Record<keyof ProfileInput, string[]>>;

/** A saved profile as the form shows it before any edit. */
export function profileFormValues(profile: ProfileInput): ProfileFormValues {
  return {
    fullName: profile.fullName,
    major: profile.major ?? "",
    graduationYear:
      profile.graduationYear === null ? "" : String(profile.graduationYear),
    bio: profile.bio ?? "",
    interests: profile.interests.join(", "),
  };
}

export function readProfileForm(formData: FormData): ProfileFormValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    fullName: text("fullName"),
    major: text("major"),
    graduationYear: text("graduationYear"),
    bio: text("bio"),
    interests: text("interests"),
  };
}

/** Validates the form: the clean profile, or the messages for each field. */
export function validateProfileForm(
  values: ProfileFormValues,
):
  | { success: true; data: ProfileInput }
  | { success: false; errors: ProfileFieldErrors } {
  const parsed = profileFormSchema.safeParse(values);
  if (parsed.success) return { success: true, data: parsed.data };

  return { success: false, errors: z.flattenError(parsed.error).fieldErrors };
}

/** A profile is named by its owner's Auth user id: a UUID. */
export const profileIdSchema = z.uuid();

/** A pinned post is named by its id: a UUID. */
export const postIdSchema = z.uuid();
