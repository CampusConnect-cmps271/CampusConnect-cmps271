
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { postSchema } from "./schema";

export type EditPostResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function editPost(
  postId: string,
  input: unknown
): Promise<EditPostResult> {
  const user = await requireUser();

  const validation = postSchema.safeParse(input);

  if (!validation.success) {
    const errors = validation.error.flatten().fieldErrors;

    return {
      fieldErrors: Object.fromEntries(
        Object.entries(errors)
          .filter(([, messages]) => messages?.length)
          .map(([field, messages]) => [
            field,
            messages![0],
          ])
      ),
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .update({
      title: validation.data.title,
      body: validation.data.body,
      category: validation.data.category,
      edited_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .eq("author_id", user.id)
    .eq("status", "published")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Post update error:", {
      code: error.code,
      message: error.message,
      details: error.details,
    });

    return {
      error: "Unable to update post. Check the server terminal.",
    };
  }

  if (!data) {
    console.error(
      "Post update returned no rows. Check author ownership and RLS policies."
    );

    return {
      error: "Post not found or you cannot edit it.",
    };
  }

  revalidatePath("/home");
  revalidatePath(`/posts/${postId}`);

  return { success: true };
}
