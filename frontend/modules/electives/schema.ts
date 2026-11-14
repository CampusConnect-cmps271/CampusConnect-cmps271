import { z } from "zod";
import { tokens } from "./preference-matching";

const text = (max: number) => z.string().trim().min(1).max(max)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Remove control characters");
export const MEETING_DAYS = [{ value: "M", label: "Monday" }, { value: "T", label: "Tuesday" }, { value: "W", label: "Wednesday" }, { value: "R", label: "Thursday" }, { value: "F", label: "Friday" }, { value: "S", label: "Saturday" }, { value: "U", label: "Sunday" }] as const;
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a valid meeting time.");
export const offeringPreferencesSchema = z.object({
  semester_id: z.string().regex(/^\d{6}$/, "Choose an imported semester.").optional(),
  instructors: z.array(text(300)).max(10).optional(),
  attributes: z.array(text(300)).max(10).optional(),
  meeting_days: z.array(z.enum(["M", "T", "W", "R", "F", "S", "U"])).max(7).optional(),
  earliest_start: time.optional(), latest_end: time.optional(),
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).length && !value.semester_id) ctx.addIssue({ code: "custom", message: "Choose a semester before adding instructor, attribute or meeting-time preferences." });
  if (value.earliest_start && value.latest_end && value.earliest_start >= value.latest_end) ctx.addIssue({ code: "custom", message: "The earliest start must be before the latest end." });
});
export type OfferingPreferences = z.infer<typeof offeringPreferencesSchema>;
export const preferencesSchema = z.object({
  interests: z.array(text(60)).max(10)
    .transform((values) => [...new Map(values.filter(v => tokens(v).length).map((v) => [v.toLocaleLowerCase(), v])).values()]),
  preferred_workload: z.enum(["light", "moderate", "heavy"]),
  academic_goals: z.string().trim().max(1000).refine(v => !/[\u0000-\u001f\u007f]/u.test(v), "Remove control characters"),
  completed_course_codes: z.array(text(32).transform((v) => v.toUpperCase().replace(/\s+/g, " "))).max(60)
    .transform((values) => [...new Set(values)]),
  offering_preferences: offeringPreferencesSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.interests.length && !value.offering_preferences?.semester_id) ctx.addIssue({ code: "custom", path: ["interests"], message: "Choose a semester to browse, or add an interest." });
});

export type ElectivePreferences = z.infer<typeof preferencesSchema>;
type BasicKey = "interests" | "preferred_workload" | "academic_goals" | "completed_course_codes";
export type OfferingField = "semester_id" | "instructors" | "attributes" | "meeting_days" | "earliest_start" | "latest_end";
export type PreferenceValues = Record<BasicKey, string> & Partial<Record<OfferingField, string>>;
export type PreferenceState = {
  status: "idle" | "saved" | "error";
  message?: string;
  errors?: Partial<Record<keyof ElectivePreferences, string[]>>;
  values?: PreferenceValues;
};
export function readPreferences(form: FormData): PreferenceValues {
  const values = Object.fromEntries(["interests", "preferred_workload", "academic_goals", "completed_course_codes"]
    .map((key) => [key, typeof form.get(key) === "string" ? form.get(key) : form.get(key) === null ? "" : "\u0000"])) as PreferenceValues;
  for (const key of ["semester_id", "instructors", "attributes", "earliest_start", "latest_end"] as const) {
    if (form.has(key)) values[key] = typeof form.get(key) === "string" ? form.get(key) as string : "\u0000";
  }
  if (form.has("meeting_days")) values.meeting_days = form.getAll("meeting_days").map(String).join(",");
  return values;
}
export function parsePreferenceValues(values: PreferenceValues) {
  const list = (value?: string) => [...new Set((value ?? "").split(",").map((v) => v.trim()).filter(Boolean))];
  const offering = {
    ...(values.semester_id ? { semester_id: values.semester_id } : {}),
    ...(values.instructors?.trim() ? { instructors: list(values.instructors) } : {}),
    ...(values.attributes?.trim() ? { attributes: list(values.attributes) } : {}),
    ...(values.meeting_days ? { meeting_days: list(values.meeting_days) } : {}),
    ...(values.earliest_start ? { earliest_start: values.earliest_start } : {}),
    ...(values.latest_end ? { latest_end: values.latest_end } : {}),
  };
  return preferencesSchema.safeParse({
    preferred_workload: values.preferred_workload, academic_goals: values.academic_goals,
    interests: values.interests.split(",").map((v) => v.trim()).filter(Boolean),
    completed_course_codes: values.completed_course_codes.split(",").map((v) => v.trim()).filter(Boolean),
    ...(Object.keys(offering).length ? { offering_preferences: offering } : {}),
  });
}
export function preferenceValues(value: ElectivePreferences | null): PreferenceValues {
  return { interests: value?.interests.join(", ") ?? "", preferred_workload: value?.preferred_workload ?? "moderate",
    academic_goals: value?.academic_goals ?? "", completed_course_codes: value?.completed_course_codes.join(", ") ?? "",
    ...(value?.offering_preferences && Object.keys(value.offering_preferences).length ? {
      semester_id: value.offering_preferences.semester_id ?? "", instructors: value.offering_preferences.instructors?.join(", ") ?? "",
      attributes: value.offering_preferences.attributes?.join(", ") ?? "", meeting_days: value.offering_preferences.meeting_days?.join(",") ?? "",
      earliest_start: value.offering_preferences.earliest_start ?? "", latest_end: value.offering_preferences.latest_end ?? "",
    } : {}),
  };
}
