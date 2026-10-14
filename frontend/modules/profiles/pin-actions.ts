"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { postIdSchema } from "./schema";

export type PinResult = { pinned: boolean } | { error: string };

const PIN_FAILED_MESSAGE = "We couldn't update your pinned post. Please try again.";
const NOT_PINNABLE_MESSAGE = "You can only pin your own published posts.";

/**
 * Pins one of the signed-in student's posts to their profile, replacing any
 * earlier pin. The database refuses a post they did not write or that is not
 * published (check_profile_pin); this action turns that into a message.
 */
export async function pinPost(postId: string): Promise<PinResult> {
  const user = await requireUser();
  const parsed = postIdSchema.safeParse(postId);

  if (!parsed.success) return { error: NOT_PINNABLE_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ pinned_post_id: parsed.data })
    .eq("id", user.id)
    .select("pinned_post_id")
    .maybeSingle();

  if (error?.code === "23514") {
    log.warn(
      "profiles.pin.rejected",
      { postId: parsed.data, code: error.code },
      { userId: user.id },
    );
    return { error: NOT_PINNABLE_MESSAGE };
  }

  if (error || !data) {
    log.error(
      "profiles.pin.failure",
      { postId: parsed.data, code: error?.code ?? "no_profile_row" },
      { userId: user.id },
    );
    return { error: PIN_FAILED_MESSAGE };
  }

  log.info("profiles.pin.success", { postId: parsed.data }, { userId: user.id });
  revalidatePath("/profile");
  revalidatePath(`/posts/${parsed.data}`);

  return { pinned: true };
}

/**
 * Unpins a post from the signed-in student's profile. Clears the pin only if
 * it is still this post, so a stale page cannot remove a newer pin.
 */
export async function unpinPost(postId: string): Promise<PinResult> {
  const user = await requireUser();
  const parsed = postIdSchema.safeParse(postId);

  if (!parsed.success) return { pinned: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ pinned_post_id: null })
    .eq("id", user.id)
    .eq("pinned_post_id", parsed.data);

  if (error) {
    log.error(
      "profiles.unpin.failure",
      { postId: parsed.data, code: error.code ?? null },
      { userId: user.id },
    );
    return { error: PIN_FAILED_MESSAGE };
  }

  log.info("profiles.unpin.success", { postId: parsed.data }, { userId: user.id });
  revalidatePath("/profile");
  revalidatePath(`/posts/${parsed.data}`);

  return { pinned: false };
}
