import * as z from "zod";
import { parseCalendarDate } from "./calendar";
import { formatTermDate, officialTerm, TERM_PATTERN } from "./terms";
import { minutesFromTime, normalizeTimeZone } from "./time";
import type { Weekday } from "./types";

/**
 * Limits, matching the triggers and checks in
 * 20261031140841_planner_semester_plans.sql and
 * 20261031221500_planner_calendar_items.sql. The database has the final say;
 * these let a form explain a problem before the row is rejected.
 */
export const PLANNER_LIMITS = {
  plans: 10,
  coursesPerPlan: 12,
  meetingsPerCourse: 7,
  itemsPerPlan: 100,
  itemTitleLength: 120,
  searchLength: 80,
  searchResults: 10,
} as const;

/** The default zone for a meeting; any IANA zone is accepted. */
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
    // Saved under Intl's name for the zone, which the database recognises.
    timezone: formText.pipe(
      z
        .string()
        .min(1, "Enter a time zone, such as Asia/Beirut.")
        .transform((value, context) => {
          const zone = normalizeTimeZone(value);
          if (!zone) {
            context.addIssue({ code: "custom", message: "Enter an IANA time zone, such as Asia/Beirut or America/New_York." });
            return z.NEVER;
          }
          return zone;
        }),
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

/** An optional "HH:MM"; empty means none. */
function optionalTimeField(invalidMessage: string) {
  return formText.transform((value, context) => {
    if (!value) return null;
    const minutes = minutesFromTime(value);
    if (minutes === null) {
      context.addIssue({ code: "custom", message: invalidMessage });
      return z.NEVER;
    }
    return minutes;
  });
}

/**
 * Something the student adds to a plan's calendar: a title, a date within
 * `window` and, unless it lasts all day, Beirut start and end times.
 */
export function itemSchema(window: { first: string; last: string }) {
  const outside = `Pick a date between ${formatTermDate(window.first)} and ${formatTermDate(window.last)}.`;
  return z
    .object({
      title: formText.pipe(
        z
          .string()
          .min(1, "Enter a title, such as CMPS 202 midterm.")
          .max(PLANNER_LIMITS.itemTitleLength, `Keep the title to ${PLANNER_LIMITS.itemTitleLength} characters.`),
      ),
      date: formText.pipe(
        z
          .string()
          .min(1, "Choose a date.")
          .refine((value) => parseCalendarDate(value) !== null, "Enter the date as YYYY-MM-DD.")
          .refine((value) => value >= window.first && value <= window.last, outside),
      ),
      start: optionalTimeField("Enter the start time as HH:MM."),
      end: optionalTimeField("Enter the end time as HH:MM."),
      planCourseId: formText.pipe(
        z
          .string()
          .refine((value) => value === "" || plannerIdSchema.safeParse(value).success, "Choose a course from the list.")
          .transform((value) => value || null),
      ),
    })
    .superRefine((item, context) => {
      if ((item.start === null) !== (item.end === null)) {
        context.addIssue({
          code: "custom",
          path: [item.start === null ? "start" : "end"],
          message: "Enter both times, or neither for an all-day item.",
        });
      } else if (item.start !== null && item.end !== null && item.end <= item.start) {
        context.addIssue({ code: "custom", path: ["end"], message: "The end time must be after the start time." });
      }
    });
}

export type ItemInput = z.output<ReturnType<typeof itemSchema>>;

/** The item form's raw text, echoed back so a failed save keeps it. */
export type ItemFormValues = { title: string; date: string; start: string; end: string; planCourseId: string };

export type ItemFieldErrors = Partial<Record<keyof ItemFormValues, string>>;

export const EMPTY_ITEM_FORM: ItemFormValues = { title: "", date: "", start: "", end: "", planCourseId: "" };

export function readItemForm(formData: FormData): ItemFormValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    title: text("title"),
    date: text("date"),
    start: text("start"),
    end: text("end"),
    planCourseId: text("planCourseId"),
  };
}

/** Validates the item form: the clean item, or the first message per field. */
export function validateItemForm(
  values: ItemFormValues,
  window: { first: string; last: string },
): { success: true; data: ItemInput } | { success: false; errors: ItemFieldErrors } {
  const parsed = itemSchema(window).safeParse(values);
  if (parsed.success) return { success: true, data: parsed.data };

  const fieldErrors = z.flattenError(parsed.error).fieldErrors;
  const errors: ItemFieldErrors = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) errors[field as keyof ItemFormValues] = messages[0];
  }
  return { success: false, errors };
}
