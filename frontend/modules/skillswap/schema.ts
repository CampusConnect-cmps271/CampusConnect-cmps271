import * as z from "zod";

/**
 * Limits, matching the checks in the SkillSwap migration
 * (20261018200000_create_skillswap.sql). The database has the final say;
 * these let the form explain a problem before the row is rejected.
 */
export const SKILLSWAP_LIMITS = {
  canTeach: 300,
  wantsToLearn: 300,
  availability: 120,
  details: 2000,
} as const;

export const MEETING_METHODS = ["online", "in_person", "either"] as const;

export type MeetingMethod = (typeof MEETING_METHODS)[number];

/** The choices on the form. */
export const MEETING_METHOD_OPTIONS: Record<MeetingMethod, string> = {
  online: "Online",
  in_person: "In person",
  either: "Either",
};

/**
 * How a meeting method reads on the board and the post page. The post body
 * uses the same words (skillswap_post_text in the migration).
 */
export function meetingMethodLabel(method: string): string {
  switch (method) {
    case "online":
      return "Online";
    case "in_person":
      return "In person";
    default:
      return "Online or in person";
  }
}

/** Text a form field holds. A missing field reads as empty. */
const formText = z.unknown().transform((value) => (typeof value === "string" ? value : ""));

function requiredText(max: number, emptyMessage: string, label: string) {
  return formText
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, emptyMessage)
        .max(max, `${label} can be up to ${max} characters.`),
    );
}

function optionalText(max: number, label: string) {
  return formText
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .max(max, `${label} can be up to ${max} characters.`)
        .transform((value) => (value === "" ? null : value)),
    );
}

/**
 * A SkillSwap post as the template collects it. Shared by the form, which
 * checks before submitting, and the server actions, which check again
 * because anyone can POST to them.
 */
export const skillSwapSchema = z.object({
  canTeach: requiredText(
    SKILLSWAP_LIMITS.canTeach,
    "Tell students what you can teach.",
    "What you can teach",
  ),
  wantsToLearn: requiredText(
    SKILLSWAP_LIMITS.wantsToLearn,
    "Tell students what you want to learn.",
    "What you want to learn",
  ),
  meetingMethod: z.enum(MEETING_METHODS, { error: "Choose how you'd like to meet." }),
  availability: optionalText(SKILLSWAP_LIMITS.availability, "Availability"),
  details: optionalText(SKILLSWAP_LIMITS.details, "Extra details"),
});

export type SkillSwapInput = z.output<typeof skillSwapSchema>;

/** The form's raw text, echoed back so a failed save keeps what was typed. */
export type SkillSwapFormValues = Record<keyof SkillSwapInput, string>;

export type SkillSwapFieldErrors = Partial<Record<keyof SkillSwapInput, string>>;

export const EMPTY_SKILLSWAP_FORM: SkillSwapFormValues = {
  canTeach: "",
  wantsToLearn: "",
  meetingMethod: "either",
  availability: "",
  details: "",
};

export function readSkillSwapForm(formData: FormData): SkillSwapFormValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    canTeach: text("canTeach"),
    wantsToLearn: text("wantsToLearn"),
    meetingMethod: text("meetingMethod"),
    availability: text("availability"),
    details: text("details"),
  };
}

/** Validates the form: the clean post, or the first message for each field. */
export function validateSkillSwapForm(
  values: SkillSwapFormValues,
): { success: true; data: SkillSwapInput } | { success: false; errors: SkillSwapFieldErrors } {
  const parsed = skillSwapSchema.safeParse(values);
  if (parsed.success) return { success: true, data: parsed.data };

  const fieldErrors = z.flattenError(parsed.error).fieldErrors;
  const errors: SkillSwapFieldErrors = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) errors[field as keyof SkillSwapInput] = messages[0];
  }
  return { success: false, errors };
}

/** SkillSwap posts are named by their post's id: a UUID. */
export const skillSwapPostIdSchema = z.uuid();
