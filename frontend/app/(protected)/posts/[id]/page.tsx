
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { PinPostButton } from "@/modules/profiles";
import { createClient } from "@/lib/supabase/server";
import DeletePostButton from "./delete-post-button";
import UpvoteButton from "./upvote-button";

type PostPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const metadata: Metadata = {
  title: "Post · CampusConnect",
};

export default async function PostPage({
  params,
}: PostPageProps) {
  const user = await requireUser();
  const { id } = await params;

  const supabase = await createClient();

  const { data: post, error } = await supabase
    .from("posts")
    .select(
      "id, author_id, title, body, category, created_at, edited_at"
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error || !post) {
    notFound();
  }

  const isAuthor = post.author_id === user.id;

  const { count: upvoteCount, error: countError } =
    await supabase
      .from("post_upvotes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id);

  if (countError) {
    console.error("Failed to load upvote count:", countError);
    throw new Error("Failed to load upvotes.");
  }

  const { data: myUpvote, error: myUpvoteError } =
    await supabase
      .from("post_upvotes")
      .select("post_id")
      .eq("post_id", post.id)
      .eq("user_id", user.id)
      .maybeSingle();

  if (myUpvoteError) {
    console.error("Failed to load upvote status:", myUpvoteError);
    throw new Error("Failed to load upvote status.");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/home"
        className="mb-8 inline-block text-sm text-blue-400 hover:underline"
      >
        ← Back to feed
      </Link>

      <article className="rounded-xl border border-gray-700 p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-400">
            {post.category}
          </span>

          <time className="text-xs text-gray-400">
            Posted{" "}
            {new Date(post.created_at).toLocaleString()}
          </time>
        </div>

        <h1 className="mb-4 text-3xl font-bold">
          {post.title}
        </h1>

        <p className="mb-6 text-sm text-gray-400">
          Author: {isAuthor ? "You" : "CampusConnect student"}
        </p>

        <div className="whitespace-pre-wrap break-words leading-7">
          {post.body}
        </div>

        {post.edited_at && (
          <p className="mt-6 text-xs text-gray-400">
            Last edited{" "}
            {new Date(post.edited_at).toLocaleString()}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-gray-700 pt-5">
          <UpvoteButton
            postId={post.id}
            initialCount={upvoteCount ?? 0}
            initiallyUpvoted={Boolean(myUpvote)}
          />

          <span className="text-sm text-gray-400">
            0 comments
          </span>
        </div>

        {isAuthor && (
          <div className="mt-6 flex flex-wrap gap-3 border-t border-gray-700 pt-5">
            <Link
              href={`/posts/${post.id}/edit`}
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Edit post
            </Link>

            <DeletePostButton postId={post.id} />

            <PinPostButton postId={post.id} />
          </div>
        )}
      </article>
    </main>
  );
}
