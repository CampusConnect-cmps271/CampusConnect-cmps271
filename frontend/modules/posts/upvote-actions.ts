
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";

export type ToggleUpvoteResult = {
  success?: boolean;
  upvoted?: boolean;
  error?: string;
};

export async function togglePostUpvote(
  postId: string
): Promise<ToggleUpvoteResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();

  if (postError || !post) {
    return { error: "Post not found." };
  }

  const { data: existingVote, error: voteError } =
    await supabase
      .from("post_upvotes")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle();

  if (voteError) {
    console.error("Failed to check upvote:", voteError);
    return { error: "Unable to check upvote status." };
  }

  if (existingVote) {
    const { error } = await supabase
      .from("post_upvotes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to remove upvote:", error);
      return { error: "Unable to remove upvote." };
    }

    revalidatePath("/home");
    revalidatePath(`/posts/${postId}`);

    return { success: true, upvoted: false };
  }

  const { error } = await supabase
    .from("post_upvotes")
    .insert({
      post_id: postId,
      user_id: user.id,
    });

  if (error) {
    console.error("Failed to add upvote:", error);
    return { error: "Unable to upvote post." };
  }

  revalidatePath("/home");
  revalidatePath(`/posts/${postId}`);

  return { success: true, upvoted: true };
}
