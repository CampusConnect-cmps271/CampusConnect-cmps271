import { z } from "zod";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export const announcementSchema = z.object({
  clubId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  announcementId: z.string().uuid().optional(),
  title: z.string().min(3, "Use at least 3 characters.").max(160),
  body: z.string().min(10, "Use at least 10 characters.").max(5000),
  intent: z.enum(["draft", "publish"]),
});

export const verificationReviewSchema = z.object({
  clubId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  decision: z.enum(["verified", "rejected"]),
  reason: z.string().max(500),
}).superRefine((value, context) => {
  if (value.decision === "rejected" && value.reason.length < 3) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Explain the rejection in at least 3 characters." });
  }
});

export function readAnnouncementForm(formData: FormData) {
  const announcementId = text(formData, "announcementId");
  return {
    clubId: text(formData, "clubId"), slug: text(formData, "slug"),
    announcementId: announcementId || undefined,
    title: text(formData, "title"), body: text(formData, "body"), intent: text(formData, "intent"),
  };
}

export function readVerificationReview(formData: FormData) {
  return {
    clubId: text(formData, "clubId"), slug: text(formData, "slug"),
    decision: text(formData, "decision"), reason: text(formData, "reason"),
  };
}
