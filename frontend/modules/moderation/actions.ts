"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth";
import {
  liftSuspensionSchema,
  moderationDecisionSchema,
  reportSchema,
  suspensionSchema,
} from "./schema";

export type ModerationActionResult = {
  success?: boolean;
  error?: string;
};

export async function submitContentReport(
  input: unknown,
): Promise<ModerationActionResult> {
  const user = await requireUser();
  const parsed = reportSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid report." };
  }

  const supabase = await createClient();
  const target =
    parsed.data.targetType === "post"
      ? { post_id: parsed.data.targetId, comment_id: null }
      : { post_id: null, comment_id: parsed.data.targetId };

  const { error } = await supabase.from("content_reports").insert({
    reporter_id: user.id,
    ...target,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
  });

  if (error?.code === "23505") {
    return { error: "You already reported this content." };
  }

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "You cannot report this content. Your account may be suspended or the content is unavailable."
          : "Unable to submit the report. Please try again.",
    };
  }

  revalidatePath("/moderation");
  return { success: true };
}

export async function moderateReportedContent(
  input: unknown,
): Promise<ModerationActionResult> {
  await requireRole(["moderator", "administrator"]);
  const parsed = moderationDecisionSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_reported_content", {
    report_target_type: parsed.data.targetType,
    report_target_id: parsed.data.targetId,
    decision: parsed.data.decision,
    decision_reason: parsed.data.reason,
  });

  if (error) {
    return { error: "Unable to apply the moderation decision." };
  }

  revalidatePath("/moderation");
  revalidatePath("/home");
  revalidatePath("/posts/[id]", "page");
  return { success: true };
}

export async function suspendAccount(
  input: unknown,
): Promise<ModerationActionResult> {
  await requireRole(["administrator"]);
  const parsed = suspensionSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid suspension." };
  }

  const supabase = await createClient();
  const durationDays = parsed.data.duration === "1d" ? 1 : 7;
  const suspensionUntil =
    parsed.data.duration === "indefinite"
      ? null
      : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.rpc("admin_set_suspension", {
    target_user_id: parsed.data.userId,
    suspension_reason: parsed.data.reason,
    suspension_until: suspensionUntil,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/accounts");
  revalidatePath("/admin/audit");
  return { success: true };
}

export async function liftAccountSuspension(
  input: unknown,
): Promise<ModerationActionResult> {
  await requireRole(["administrator"]);
  const parsed = liftSuspensionSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_lift_suspension", {
    target_user_id: parsed.data.userId,
    lift_reason: parsed.data.reason,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/accounts");
  revalidatePath("/admin/audit");
  return { success: true };
}

