import "server-only";
import { z } from "zod";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";

export const POSTS_PER_PAGE = 20;
export type FeedSort = "newest" | "top";
export type FeedPost = {
  id: string; author_id: string; title: string; body: string; category: string;
  created_at: string; edited_at: string | null; comment_count: number; upvote_count: number;
};
export type FeedResult = {
  posts: FeedPost[]; hasMore: boolean; nextPage: number | null;
  categories: string[]; selectedCategory: string;
};
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const feedSchema = z.object({
  categories: z.array(z.string()), selectedCategory: z.string(), hasMore: z.boolean(),
  posts: z.array(z.object({
    id: z.uuid(), author_id: z.uuid(), title: z.string(), body: z.string(), category: z.string(),
    created_at: z.string(), edited_at: z.string().nullable(), comment_count: count, upvote_count: count,
  })).max(POSTS_PER_PAGE),
});

/** One RLS-scoped request replaces category, ranked-post and comment-row reads. */
export async function getFeedPosts(page = 1, sort: FeedSort = "newest", category?: string): Promise<FeedResult> {
  await requireUser();
  const client = await createClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.min(100, Math.floor(page)) : 1;
  const { data, error } = await client.rpc("get_campus_feed_page", {
    p_page: safePage, p_sort: sort === "top" ? "top" : "newest",
    p_category: typeof category === "string" && category.length <= 200 ? category : "",
  });
  const result = feedSchema.safeParse(data);
  if (error || !result.success) {
    log.error("posts.feed.read_failure", { code: error?.code ?? "invalid_data" });
    throw new Error("Failed to load posts.");
  }
  return { ...result.data, nextPage: result.data.hasMore ? safePage + 1 : null };
}
