
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import PostForm from "./post-form";

export default async function NewPostPage() {
  await requireUser();

  const supabase = await createClient();

  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name")
    .order("id", { ascending: true });

  if (error) {
    throw new Error("Failed to load categories.");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold">
        Create a post
      </h1>

      <p className="mb-8 text-gray-500">
        Share a question, announcement, or update with your
        campus community.
      </p>

      <PostForm categories={categories ?? []} />
    </main>
  );
}
