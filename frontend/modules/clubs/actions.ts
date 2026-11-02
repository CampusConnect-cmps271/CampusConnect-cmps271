"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { checkContentRestrictions } from "@/modules/moderation/restrictions";
import { log } from "@/modules/logging";
import { announcementSchema, readAnnouncementForm, readVerificationReview, verificationReviewSchema } from "./schema";

export type ClubActionState = { status: "error" | "success"; message: string } | undefined;

const error = (message: string): ClubActionState => ({ status: "error", message });

export async function requestClubVerification(_state: ClubActionState, formData: FormData): Promise<ClubActionState> {
  await requireUser();
  const clubId = String(formData.get("clubId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clubId) || !/^[a-z0-9-]+$/.test(slug)) return error("Invalid club request.");
  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("request_club_verification", { requested_club_id: clubId });
  if (rpcError) return error(rpcError.code === "42501" ? "Only this club's representative can request verification." : "Verification could not be requested.");
  revalidatePath(`/clubs/${slug}`);
  revalidatePath("/admin/clubs");
  return { status: "success", message: "Verification request sent." };
}

export async function reviewClubVerification(_state: ClubActionState, formData: FormData): Promise<ClubActionState> {
  await requireRole(["administrator"]);
  const parsed = verificationReviewSchema.safeParse(readVerificationReview(formData));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid verification decision.");
  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("review_club_verification", {
    requested_club_id: parsed.data.clubId, decision: parsed.data.decision,
    decision_reason: parsed.data.reason || null,
  });
  if (rpcError) return error("The verification decision could not be saved.");
  revalidatePath("/admin/clubs");
  revalidatePath(`/clubs/${parsed.data.slug}`);
  return { status: "success", message: `Club ${parsed.data.decision}.` };
}

export async function saveClubAnnouncement(_state: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const user = await requireUser();
  const parsed = announcementSchema.safeParse(readAnnouncementForm(formData));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Check the announcement fields.");
  const value = parsed.data;
  const restriction = await checkContentRestrictions({
    userId: user.id, contentType: "announcement", title: value.title, body: value.body,
    excludeId: value.announcementId,
  });
  if (!restriction.allowed) return error(restriction.message);

  const supabase = await createClient();
  const payload = {
    title: value.title, body: value.body,
    status: value.intent === "publish" ? "published" : "draft",
    published_at: value.intent === "publish" ? new Date().toISOString() : null,
  };
  const result = value.announcementId
    ? await supabase.from("club_announcements").update(payload).eq("id", value.announcementId).eq("club_id", value.clubId).select("id").maybeSingle()
    : await supabase.from("club_announcements").insert({ ...payload, club_id: value.clubId, author_id: user.id }).select("id").single();
  if (result.error || !result.data) {
    log.warn("clubs.announcement.save_rejected", { code: result.error?.code ?? "no_row" }, { userId: user.id });
    return error(result.error?.code === "42501" ? "Only representatives of verified clubs can manage announcements." : "The announcement could not be saved.");
  }
  revalidatePath(`/clubs/${value.slug}`);
  redirect(`/clubs/${value.slug}/announcements/${result.data.id}`);
}

export async function removeClubAnnouncement(_state: ClubActionState, formData: FormData): Promise<ClubActionState> {
  await requireUser();
  const id = String(formData.get("announcementId") ?? "");
  const clubId = String(formData.get("clubId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (![id, clubId].every((value) => /^[0-9a-f-]{36}$/i.test(value)) || !/^[a-z0-9-]+$/.test(slug)) return error("Invalid announcement.");
  const supabase = await createClient();
  const { data, error: updateError } = await supabase.from("club_announcements").update({ status: "removed", published_at: null })
    .eq("id", id).eq("club_id", clubId).select("id").maybeSingle();
  if (updateError || !data) return error("The announcement could not be removed.");
  revalidatePath(`/clubs/${slug}`);
  redirect(`/clubs/${slug}`);
}
