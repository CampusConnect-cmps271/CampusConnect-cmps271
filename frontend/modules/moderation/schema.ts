import { z } from "zod";

export const reportReasonSchema = z.enum([
  "spam",
  "harassment",
  "offensive",
  "misleading",
  "other",
]);

export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.uuid(),
  reason: reportReasonSchema,
  details: z.string().trim().max(1000, "Details cannot exceed 1000 characters."),
});

export const moderationDecisionSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.uuid(),
  decision: z.enum(["remove", "dismiss"]),
  reason: z
    .string()
    .trim()
    .min(3, "Please provide a reason.")
    .max(500, "Reason cannot exceed 500 characters."),
});

export const suspensionSchema = z.object({
  userId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(3, "Please provide a reason.")
    .max(500, "Reason cannot exceed 500 characters."),
  duration: z.enum(["1d", "7d", "indefinite"]),
});

export const liftSuspensionSchema = z.object({
  userId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(3, "Please provide a reason.")
    .max(500, "Reason cannot exceed 500 characters."),
});

