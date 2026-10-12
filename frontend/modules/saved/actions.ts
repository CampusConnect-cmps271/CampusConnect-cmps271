"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";

export type ToggleSaveResult = {
  success?: boolean;
  saved?: boolean;
  error?: string;
};

export async function toggleSavedPost(
  postId: string
): Promise<ToggleSaveResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing, error: lookupError } = await supabase
    .from("saved_posts")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("Failed to check saved post:", lookupError);
    return { error: "Unable to check saved status." };
  }

  if (existing) {
    const { error } = await supabase
      .from("saved_posts")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to unsave post:", error);
      return { error: "Unable to remove this post from Saved." };
    }

    revalidatePath("/saved");
    revalidatePath(`/posts/${postId}`);

    return { success: true, saved: false };
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();

  if (postError || !post) {
    return { error: "Post not found." };
  }

  const { error } = await supabase.from("saved_posts").insert({
    post_id: postId,
    user_id: user.id,
  });

  if (error) {
    console.error("Failed to save post:", error);
    return { error: "Unable to save this post." };
  }

  revalidatePath("/saved");
  revalidatePath(`/posts/${postId}`);

  return { success: true, saved: true };
}
