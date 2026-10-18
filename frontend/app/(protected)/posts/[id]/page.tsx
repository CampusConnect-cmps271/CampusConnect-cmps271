
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { MessageButton } from "@/modules/messaging";
import { getProfile, PinPostButton } from "@/modules/profiles";
import { createClient } from "@/lib/supabase/server";
import DeletePostButton from "./delete-post-button";
import UpvoteButton from "./upvote-button";
import SaveButton from "./save-button";
import CommentSection, { loadComments } from "./comment-section";

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
  const author = isAuthor ? null : await getProfile(post.author_id);

  const [countResult, myUpvoteResult, mySaveResult, comments] =
    await Promise.all([
      supabase
        .from("post_upvotes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", post.id),
      supabase
        .from("post_upvotes")
        .select("post_id")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("saved_posts")
        .select("post_id")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      loadComments(post.id),
    ]);

  const { count: upvoteCount, error: countError } = countResult;
  const { data: myUpvote, error: myUpvoteError } = myUpvoteResult;
  const { data: mySave, error: mySaveError } = mySaveResult;

  if (countError) {
    console.error("Failed to load upvote count:", countError);
    throw new Error("Failed to load upvotes.");
  }

  if (myUpvoteError) {
    console.error("Failed to load upvote status:", myUpvoteError);
    throw new Error("Failed to load upvote status.");
  }

  if (mySaveError) {
    console.error("Failed to load saved status:", mySaveError);
    throw new Error("Failed to load saved status.");
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

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-400">
            Author:{" "}
            {isAuthor ? (
              "You"
            ) : author ? (
              <Link
                href={`/profile/${author.id}`}
                className="font-medium text-blue-400 hover:underline"
              >
                {author.fullName}
              </Link>
            ) : (
              "CampusConnect student"
            )}
          </p>

          {author ? (
            <MessageButton studentId={author.id} studentName={author.fullName} />
          ) : null}
        </div>

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

          <SaveButton
            postId={post.id}
            initiallySaved={Boolean(mySave)}
          />

          <span className="text-sm text-gray-400">
            {comments.length}{" "}
            {comments.length === 1 ? "comment" : "comments"}
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

        <CommentSection
          postId={post.id}
          userId={user.id}
          comments={comments}
        />
      </article>
    </main>
  );
}
