import { z } from "zod";
import { postSchema } from "@/modules/posts/schema";

/** A community's topic, as the database stores it. */
export const COMMUNITY_TOPICS = ["course", "interest", "student_life", "housing", "other"] as const;
export type CommunityTopic = (typeof COMMUNITY_TOPICS)[number];

export const TOPIC_LABELS: Record<CommunityTopic, string> = {
  course: "Course",
  interest: "Interest",
  student_life: "Student life",
  housing: "Housing",
  other: "Other",
};

/** The same limits the database's check constraints enforce. */
export const COMMUNITY_LIMITS = {
  nameMin: 3,
  nameMax: 80,
  description: 500,
} as const;

/** The categories a community post can use: the feed's own list. */
export const COMMUNITY_POST_CATEGORIES = postSchema.shape.category.options;

export function isCommunityTopic(value: unknown): value is CommunityTopic {
  return typeof value === "string" && (COMMUNITY_TOPICS as readonly string[]).includes(value);
}

/** Collapses runs of whitespace, so "CMPS  271" and "CMPS 271" are one name. */
export function tidyName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export const communityIdSchema = z.string().uuid();

export const communitySlugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const communitySchema = z
  .object({
    name: z
      .string()
      .transform(tidyName)
      .pipe(
        z
          .string()
          .min(COMMUNITY_LIMITS.nameMin, `Use at least ${COMMUNITY_LIMITS.nameMin} characters.`)
          .max(COMMUNITY_LIMITS.nameMax, `Use at most ${COMMUNITY_LIMITS.nameMax} characters.`),
      ),
    description: z
      .string()
      .trim()
      .max(COMMUNITY_LIMITS.description, `Use at most ${COMMUNITY_LIMITS.description} characters.`)
      .transform((value) => (value === "" ? null : value)),
    topic: z.enum(COMMUNITY_TOPICS, { error: "Choose a topic." }),
    courseId: z.string().trim(),
  })
  .superRefine((value, context) => {
    if (value.topic === "course" && !communityIdSchema.safeParse(value.courseId).success) {
      context.addIssue({ code: "custom", path: ["courseId"], message: "Choose the course." });
    }
  })
  .transform(({ courseId, ...rest }) => ({
    ...rest,
    courseId: rest.topic === "course" ? courseId : null,
  }));

export type CommunityInput = z.output<typeof communitySchema>;

/** What the community form holds. courseLabel only shows the chosen course. */
export type CommunityFormValues = {
  name: string;
  description: string;
  topic: string;
  courseId: string;
  courseLabel: string;
};

export type CommunityFieldErrors = Partial<Record<"name" | "description" | "topic" | "courseId", string>>;

export const EMPTY_COMMUNITY_FORM: CommunityFormValues = {
  name: "",
  description: "",
  topic: "",
  courseId: "",
  courseLabel: "",
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function readCommunityForm(formData: FormData): CommunityFormValues {
  return {
    name: text(formData, "name"),
    description: text(formData, "description"),
    topic: text(formData, "topic"),
    courseId: text(formData, "courseId"),
    courseLabel: text(formData, "courseLabel"),
  };
}

function firstErrors<T extends string>(error: z.ZodError, fields: readonly T[]): Partial<Record<T, string>> {
  const errors: Partial<Record<T, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && (fields as readonly string[]).includes(field) && !errors[field as T]) {
      errors[field as T] = issue.message;
    }
  }
  return errors;
}

export function validateCommunityForm(
  values: CommunityFormValues,
): { success: true; data: CommunityInput } | { success: false; errors: CommunityFieldErrors } {
  const parsed = communitySchema.safeParse(values);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, errors: firstErrors(parsed.error, ["name", "description", "topic", "courseId"] as const) };
}

/** A post in a community: the feed's post rules. */
export const communityPostSchema = postSchema;
export type CommunityPostInput = z.output<typeof communityPostSchema>;

export type CommunityPostFormValues = { title: string; body: string; category: string };
export type CommunityPostFieldErrors = Partial<Record<"title" | "body" | "category", string>>;

export const EMPTY_COMMUNITY_POST_FORM: CommunityPostFormValues = { title: "", body: "", category: "" };

export function readCommunityPostForm(formData: FormData): CommunityPostFormValues {
  return { title: text(formData, "title"), body: text(formData, "body"), category: text(formData, "category") };
}

export function validateCommunityPostForm(
  values: CommunityPostFormValues,
): { success: true; data: CommunityPostInput } | { success: false; errors: CommunityPostFieldErrors } {
  const parsed = communityPostSchema.safeParse(values);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, errors: firstErrors(parsed.error, ["title", "body", "category"] as const) };
}
