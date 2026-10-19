"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { checkContentRestrictions } from "@/modules/moderation/restrictions";
import { commentSchema } from "./schema";

export type AddCommentResult = {
  success?: boolean;
  error?: string;
};

export async function addComment(
  postId: string,
  input: { body: string; parentId: string | null }
): Promise<AddCommentResult> {
  const user = await requireUser();

  const parsed = commentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid comment.",
    };
  }

  const restriction = await checkContentRestrictions({
    userId: user.id,
    contentType: "comment",
    body: parsed.data.body,
  });

  if (!restriction.allowed) {
    return { error: restriction.message };
  }

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

  if (parsed.data.parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("post_comments")
      .select("id, parent_id")
      .eq("id", parsed.data.parentId)
      .eq("post_id", postId)
      .maybeSingle();

    if (parentError || !parent) {
      return { error: "The comment you are replying to was not found." };
    }

    if (parent.parent_id) {
      return { error: "You can only reply to top-level comments." };
    }
  }

  const { error } = await supabase.from("post_comments").insert({
    post_id: postId,
    author_id: user.id,
    parent_id: parsed.data.parentId,
    body: parsed.data.body,
  });

  if (error) {
    console.error("Failed to add comment:", error);
    return { error: "Unable to post your comment." };
  }

  revalidatePath(`/posts/${postId}`);
  revalidatePath("/home");

  return { success: true };
}
