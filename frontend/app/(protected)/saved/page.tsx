import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
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
        className="mb-8 inline-block text-sm text-[var(--maroon)] hover:underline"
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

                <time className="text-xs text-[var(--ink-soft)]">
                  {new Date(post.created_at).toLocaleDateString()}
                </time>
              </div>

              <Link href={`/posts/${post.id}`}>
                <h2 className="mb-2 text-lg font-semibold hover:underline">
                  {post.title}
                </h2>
              </Link>

              <p className="line-clamp-3 whitespace-pre-wrap text-sm opacity-80">
                {post.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
</AppShell>
  );
}
