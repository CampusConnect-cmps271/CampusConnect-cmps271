
import "server-only";

import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";

export const POSTS_PER_PAGE = 20;

export type FeedSort = "newest" | "top";

export type FeedPost = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  edited_at: string | null;
  comment_count: number;
  upvote_count: number;
};

export type FeedResult = {
  posts: FeedPost[];
  hasMore: boolean;
  nextPage: number | null;
};

export async function getFeedPosts(
  page = 1,
  sort: FeedSort = "newest",
  category?: string
): Promise<FeedResult> {
  await requireUser();

  const supabase = await createClient();

  const safePage =
    Number.isFinite(page) && page > 0
      ? Math.floor(page)
      : 1;

  const from = (safePage - 1) * POSTS_PER_PAGE;
  const to = from + POSTS_PER_PAGE;

  let query = supabase
    .from("posts")
    .select(
      "id, author_id, title, body, category, created_at, edited_at"
    )
    .eq("status", "published");

  if (category) {
    query = query.eq("category", category);
  }

  // Top sorting will use upvote counts once voting exists.
  // For now both modes use a stable newest-first order.
  void sort;

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error("Failed to load posts.");
  }

  const rows = data ?? [];
  const hasMore = rows.length > POSTS_PER_PAGE;

  return {
    posts: rows.slice(0, POSTS_PER_PAGE).map((post) => ({
      ...post,
      comment_count: 0,
      upvote_count: 0,
    })),
    hasMore,
    nextPage: hasMore ? safePage + 1 : null,
  };
}
