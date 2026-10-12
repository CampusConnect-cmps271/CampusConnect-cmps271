
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import EditPostForm from "./edit-post-form";

type EditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPostPage({
  params,
}: EditPageProps) {
  const user = await requireUser();
  const { id } = await params;

  const supabase = await createClient();

  const { data: post, error } = await supabase
    .from("posts")
    .select("id, author_id, title, body, category")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error || !post || post.author_id !== user.id) {
    notFound();
  }

  const { data: categories, error: categoriesError } =
    await supabase
      .from("categories")
      .select("id, name")
      .order("id", { ascending: true });

  if (categoriesError) {
    throw new Error("Failed to load categories.");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/posts/${post.id}`}
        className="mb-6 inline-block text-sm text-blue-400 hover:underline"
      >
        ← Back to post
      </Link>

      <h1 className="mb-8 text-3xl font-bold">
        Edit post
      </h1>

      <EditPostForm
        post={post}
        categories={categories ?? []}
      />
    </main>
  );
}
