
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";

export type DeletePostResult = {
  success?: boolean;
  error?: string;
};

export async function deletePost(
  postId: string
): Promise<DeletePostResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: post, error: lookupError } = await supabase
    .from("posts")
    .select("id, author_id, status")
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();

  if (lookupError) {
    console.error("Delete lookup error:", lookupError);
    return { error: "Unable to load post." };
  }

  if (!post) {
    return { error: "Post not found." };
  }

  if (post.author_id !== user.id) {
    return {
      error: "You cannot delete someone else's post.",
    };
  }

  const { error: deleteError } = await supabase
    .from("posts")
    .update({
      status: "deleted",
    })
    .eq("id", postId)
    .eq("author_id", user.id)
    .eq("status", "published");

  if (deleteError) {
    console.error("Post deletion failed:", {
      code: deleteError.code,
      message: deleteError.message,
      details: deleteError.details,
      hint: deleteError.hint,
    });

    return {
      error: `Unable to delete post: ${deleteError.message}`,
    };
  }

  revalidatePath("/home");
  revalidatePath(`/posts/${postId}`);

  return { success: true };
}
