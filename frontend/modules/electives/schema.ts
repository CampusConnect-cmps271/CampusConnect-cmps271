import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Remove control characters");
export const preferencesSchema = z.object({
  interests: z.array(text(60)).min(1, "Add at least one interest").max(10)
    .transform((values) => [...new Map(values.map((v) => [v.toLocaleLowerCase(), v])).values()]),
  preferred_workload: z.enum(["light", "moderate", "heavy"]),
  academic_goals: text(1000),
  completed_course_codes: z.array(text(32).transform((v) => v.toUpperCase().replace(/\s+/g, " "))).max(60)
    .transform((values) => [...new Set(values)]),
}).strict();

export type ElectivePreferences = z.infer<typeof preferencesSchema>;
export type PreferenceValues = Record<keyof ElectivePreferences, string>;
export type PreferenceState = {
  status: "idle" | "saved" | "error";
  message?: string;
  errors?: Partial<Record<keyof ElectivePreferences, string[]>>;
  values?: PreferenceValues;
};
export function readPreferences(form: FormData): PreferenceValues {
  return Object.fromEntries(["interests", "preferred_workload", "academic_goals", "completed_course_codes"]
    .map((key) => [key, typeof form.get(key) === "string" ? form.get(key) : ""])) as PreferenceValues;
}
export function parsePreferenceValues(values: PreferenceValues) {
  return preferencesSchema.safeParse({ ...values,
    interests: values.interests.split(",").map((v) => v.trim()).filter(Boolean),
    completed_course_codes: values.completed_course_codes.split(",").map((v) => v.trim()).filter(Boolean),
  });
}
export function preferenceValues(value: ElectivePreferences | null): PreferenceValues {
  return { interests: value?.interests.join(", ") ?? "", preferred_workload: value?.preferred_workload ?? "moderate",
    academic_goals: value?.academic_goals ?? "", completed_course_codes: value?.completed_course_codes.join(", ") ?? "" };
}
