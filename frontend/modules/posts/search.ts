import "server-only";
import { z } from "zod";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/modules/logging";
import { normalizePostSearch, POST_SEARCH_MAX_PAGE, POST_SEARCH_PAGE_SIZE } from "./search-input";

const searchPostSchema = z.object({
  id: z.uuid(), author_id: z.uuid(), title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000), category: z.string().min(1),
  created_at: z.iso.datetime({ offset: true }), edited_at: z.iso.datetime({ offset: true }).nullable(),
  relevance: z.number().nonnegative(),
});
export type SearchPost = z.infer<typeof searchPostSchema>;
export type PostSearchResult = { query: string; page: number; posts: SearchPost[]; hasMore: boolean; nextPage: number | null };

export class PostSearchUnavailable extends Error {
  constructor() { super("Post search is temporarily unavailable."); this.name = "PostSearchUnavailable"; }
}

export async function getPostSearchResults(value: string, page = 1): Promise<PostSearchResult> {
  // Never catch a sign-in redirect as a database failure, even for empty input.
  await requireUser();
  const input = normalizePostSearch(value, page);
  const empty: PostSearchResult = { ...input, posts: [], hasMore: false, nextPage: null };
  if (!input.query) return empty;
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("search_published_posts", {
      p_query: input.query, p_page: input.page, p_page_size: POST_SEARCH_PAGE_SIZE,
    });
    if (error) {
      log.error("posts.search.read_failure", { code: error.code });
      throw new PostSearchUnavailable();
    }
    const parsed = z.array(searchPostSchema).max(POST_SEARCH_PAGE_SIZE + 1).safeParse(data);
    if (!parsed.success || new Set(parsed.data.map((post) => post.id)).size !== parsed.data.length) {
      log.error("posts.search.read_failure", { code: "invalid_data" });
      throw new PostSearchUnavailable();
    }
    const hasMore = parsed.data.length > POST_SEARCH_PAGE_SIZE && input.page < POST_SEARCH_MAX_PAGE;
    return { ...input, posts: parsed.data.slice(0, POST_SEARCH_PAGE_SIZE), hasMore,
      nextPage: hasMore ? input.page + 1 : null };
  } catch (error) {
    if (error instanceof PostSearchUnavailable) throw error;
    log.error("posts.search.read_failure", { code: "connection_failure" });
    throw new PostSearchUnavailable();
  }
}
