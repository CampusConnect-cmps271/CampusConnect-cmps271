
"use server";

import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { postSchema } from "./schema";

export type CreatePostResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  postId?: string;
};

export async function createPost(
  input: unknown
): Promise<CreatePostResult> {
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
    .insert({
      author_id: user.id,
      title: validation.data.title,
      body: validation.data.body,
      category: validation.data.category,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: "Unable to create post. Please try again.",
    };
  }

  return { postId: data.id };
}
