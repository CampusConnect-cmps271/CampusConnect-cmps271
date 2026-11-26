import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import SaveButton from "../posts/[id]/save-button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Saved posts · CampusConnect",
};

type SavedPost = {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
};

type SavedRow = {
  created_at: string;
  posts: SavedPost | SavedPost[] | null;
};

export default async function SavedPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("saved_posts")
    .select("created_at, posts!inner(id, title, body, category, created_at)")
    .eq("user_id", user.id)
    .eq("posts.status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load saved posts:", error);
    throw new Error("Failed to load saved posts.");
  }

  const saved = ((data ?? []) as SavedRow[]).flatMap((row) => {
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    return post ? [post] : [];
  });

  return (
    <AppShell>
<main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/home"
        className="mb-8 inline-flex min-h-11 items-center text-sm text-[var(--maroon)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
      >
        ← Back to home
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Saved posts
      </h1>

      {saved.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] p-8 text-center">
          <p className="text-[var(--ink-soft)]">
            You haven&apos;t saved any posts yet.
          </p>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Use Save on a post to keep it here for later.
          </p>
          <Link
            href="/home"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
          >
            Browse the feed
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {saved.map((post) => (
            <li
              key={post.id}
              className="rounded-xl border border-[var(--border)] p-5"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-full bg-[var(--maroon-100)] px-3 py-1 text-xs font-medium text-[var(--maroon)]">
                  {post.category}
                </span>

                <time dateTime={post.created_at} className="text-xs text-[var(--ink-soft)]">
                  {new Date(post.created_at).toLocaleDateString()}
                </time>
              </div>

              <Link
                href={`/posts/${post.id}`}
                className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
              >
                <h2 className="mb-2 text-lg font-semibold hover:underline">
                  {post.title}
                </h2>
              </Link>

              <p className="line-clamp-3 whitespace-pre-wrap text-sm opacity-80">
                {post.body}
              </p>

              <div className="mt-4">
                <SaveButton postId={post.id} initiallySaved variant="remove" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
</AppShell>
  );
}
