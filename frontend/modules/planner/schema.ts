import * as z from "zod";
import { officialTerm, TERM_PATTERN } from "./terms";
import { minutesFromTime } from "./time";
import type { Weekday } from "./types";

/**
 * Limits, matching the triggers and checks in
 * 20261031140841_planner_semester_plans.sql. The database has the final say;
 * these let a form explain a problem before the row is rejected.
 */
export const PLANNER_LIMITS = {
  plans: 10,
  coursesPerPlan: 12,
  meetingsPerCourse: 7,
  searchLength: 80,
  searchResults: 10,
} as const;

/** The only zone the planner offers for now; the database accepts any IANA zone. */
export const PLANNER_TIMEZONE = "Asia/Beirut";

/** Plans, plan courses, meetings and catalogue courses are named by UUIDs. */
export const plannerIdSchema = z.uuid();

/** Text a form field holds. A missing field reads as empty. */
const formText = z.unknown().transform((value) => (typeof value === "string" ? value.trim() : ""));

/** A new plan: one of the official terms, whose dates the server fills in. */
export const planSchema = z.object({
  term: formText.pipe(
    z
      .string()
      .min(1, "Choose a term.")
      .regex(TERM_PATTERN, "Choose a term from the list.")
      .refine((term) => officialTerm(term) !== undefined, "Choose a term from the list."),
  ),
});

function timeField(emptyMessage: string, invalidMessage: string) {
  return formText.pipe(
    z
      .string()
      .min(1, emptyMessage)
      .transform((value, context) => {
        const minutes = minutesFromTime(value);
        if (minutes === null) {
          context.addIssue({ code: "custom", message: invalidMessage });
          return z.NEVER;
        }
        return minutes;
      }),
  );
}

/** A weekly meeting the student typed. Shared by the form and the actions. */
export const meetingSchema = z
  .object({
    weekday: formText.pipe(
      z
        .string()
        .regex(/^[1-7]$/, "Choose a day.")
        .transform((value) => Number(value) as Weekday),
    ),
    start: timeField("Enter a start time.", "Enter the start time as HH:MM."),
    end: timeField("Enter an end time.", "Enter the end time as HH:MM."),
    timezone: formText.pipe(
      z.literal(PLANNER_TIMEZONE, { error: "Meetings use Asia/Beirut time for now." }),
    ),
  })
  .refine((meeting) => meeting.end > meeting.start, {
    path: ["end"],
    message: "The end time must be after the start time.",
  });

export type MeetingInput = z.output<typeof meetingSchema>;

/** The meeting form's raw text, echoed back so a failed save keeps it. */
export type MeetingFormValues = { weekday: string; start: string; end: string; timezone: string };

export type MeetingFieldErrors = Partial<Record<keyof MeetingFormValues, string>>;

export const EMPTY_MEETING_FORM: MeetingFormValues = {
  weekday: "1",
  start: "",
  end: "",
  timezone: PLANNER_TIMEZONE,
};

export function readMeetingForm(formData: FormData): MeetingFormValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    weekday: text("weekday"),
    start: text("start"),
    end: text("end"),
    timezone: text("timezone"),
  };
}

/** Validates the meeting form: the clean meeting, or the first message per field. */
export function validateMeetingForm(
  values: MeetingFormValues,
): { success: true; data: MeetingInput } | { success: false; errors: MeetingFieldErrors } {
  const parsed = meetingSchema.safeParse(values);
  if (parsed.success) return { success: true, data: parsed.data };

  const fieldErrors = z.flattenError(parsed.error).fieldErrors;
  const errors: MeetingFieldErrors = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) errors[field as keyof MeetingFormValues] = messages[0];
  }
  return { success: false, errors };
}
