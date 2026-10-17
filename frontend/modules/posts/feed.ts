
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

type RankedPost = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  edited_at: string | null;
  upvote_count: number;
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

  const safeSort: FeedSort =
    sort === "top" ? "top" : "newest";

  const { data, error } = await supabase.rpc(
    "get_ranked_feed_posts",
    {
      p_page: safePage,
      p_page_size: POSTS_PER_PAGE,
      p_sort: safeSort,
      p_category: category || null,
    }
  );

  if (error) {
    console.error("Failed to load feed:", error.message);
    throw new Error("Failed to load posts.");
  }

  const rows = (data ?? []) as RankedPost[];

  const hasMore = rows.length > POSTS_PER_PAGE;

  const pageRows = rows.slice(0, POSTS_PER_PAGE);
  const commentCounts = new Map<string, number>();

  if (pageRows.length > 0) {
    const { data: commentRows, error: commentError } = await supabase
      .from("post_comments")
      .select("post_id")
      .in(
        "post_id",
        pageRows.map((post) => post.id)
      );

    if (commentError) {
      console.error("Failed to load comment counts:", commentError.message);
      throw new Error("Failed to load posts.");
    }

    for (const row of commentRows ?? []) {
      commentCounts.set(row.post_id, (commentCounts.get(row.post_id) ?? 0) + 1);
    }
  }

  const posts: FeedPost[] = pageRows
    .map((post) => ({
      id: post.id,
      author_id: post.author_id,
      title: post.title,
      body: post.body,
      category: post.category,
      created_at: post.created_at,
      edited_at: post.edited_at,
      upvote_count: Number(post.upvote_count ?? 0),
      comment_count: commentCounts.get(post.id) ?? 0,
    }));

  return {
    posts,
    hasMore,
    nextPage: hasMore ? safePage + 1 : null,
  };
}
