import "server-only";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { getDisplayNames } from "@/modules/profiles";
import { createClient } from "@/lib/supabase/server";
import { MEETING_METHODS, skillSwapPostIdSchema, type MeetingMethod } from "./schema";
import { BOARD_PAGE_SIZE, escapeLikePattern, type BoardSearch } from "./search";
import type { SkillSwapCard, SkillSwapPostDetails } from "./types";

const DETAIL_COLUMNS = "post_id, can_teach, wants_to_learn, meeting_method, availability, details";

type DetailRow = {
  post_id: string;
  can_teach: string;
  wants_to_learn: string;
  meeting_method: string;
  availability: string | null;
  details: string | null;
  posts: { author_id: string };
};

type CardRow = {
  post_id: string;
  can_teach: string;
  wants_to_learn: string;
  meeting_method: string;
  availability: string | null;
  created_at: string;
  posts: { author_id: string };
};

const asMeetingMethod = (value: string): MeetingMethod =>
  (MEETING_METHODS as readonly string[]).includes(value) ? (value as MeetingMethod) : "either";

function toDetails(row: DetailRow): SkillSwapPostDetails {
  return {
    postId: row.post_id,
    authorId: row.posts.author_id,
    canTeach: row.can_teach,
    wantsToLearn: row.wants_to_learn,
    meetingMethod: asMeetingMethod(row.meeting_method),
    availability: row.availability,
    details: row.details,
  };
}

/**
 * A SkillSwap post's details, or null when the post is not a SkillSwap post
 * or the student cannot see it (RLS follows the post's own visibility).
 */
export async function getSkillSwapDetails(postId: string): Promise<SkillSwapPostDetails | null> {
  if (!skillSwapPostIdSchema.safeParse(postId).success) return null;

  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("post_skillswap")
    .select(`${DETAIL_COLUMNS}, posts!inner(author_id)`)
    .eq("post_id", postId)
    .maybeSingle<DetailRow>();

  if (error) {
    log.error(
      "skillswap.details.read_failure",
      { postId, code: error.code ?? null },
      { userId: user.id },
    );
    return null;
  }

  return data ? toDetails(data) : null;
}

/**
 * A SkillSwap post the signed-in student may edit: their own, still
 * published. Null for anything else, so the edit page can 404.
 */
export async function getSkillSwapForEdit(postId: string): Promise<SkillSwapPostDetails | null> {
  if (!skillSwapPostIdSchema.safeParse(postId).success) return null;

  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("post_skillswap")
    .select(`${DETAIL_COLUMNS}, posts!inner(author_id)`)
    .eq("post_id", postId)
    .eq("posts.author_id", user.id)
    .eq("posts.status", "published")
    .maybeSingle<DetailRow>();

  if (error) {
    log.error(
      "skillswap.details.read_failure",
      { postId, code: error.code ?? null },
      { userId: user.id },
    );
    throw new Error("Failed to load the SkillSwap post.");
  }

  return data ? toDetails(data) : null;
}

/**
 * Published SkillSwap posts for the board, newest first: the first
 * `page` pages, optionally only those whose chosen box contains the term.
 */
export async function listSkillSwapPosts({
  q,
  field,
  page,
}: BoardSearch): Promise<{ cards: SkillSwapCard[]; hasMore: boolean }> {
  const user = await requireUser();
  const supabase = await createClient();
  const shown = page * BOARD_PAGE_SIZE;

  let query = supabase
    .from("post_skillswap")
    .select(
      "post_id, can_teach, wants_to_learn, meeting_method, availability, created_at, posts!inner(author_id)",
    )
    .eq("posts.status", "published");

  if (q) {
    query = query.ilike(field === "learn" ? "wants_to_learn" : "can_teach", `%${escapeLikePattern(q)}%`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("post_id", { ascending: false })
    .limit(shown + 1);

  if (error) {
    log.error(
      "skillswap.board.read_failure",
      { code: error.code ?? null, searched: q.length > 0 },
      { userId: user.id },
    );
    throw new Error("Failed to load SkillSwap posts.");
  }

  const rows = ((data ?? []) as unknown as CardRow[]).slice(0, shown);
  const names = await getDisplayNames(rows.map((row) => row.posts.author_id));

  return {
    cards: rows.map((row) => ({
      postId: row.post_id,
      authorId: row.posts.author_id,
      authorName: names[row.posts.author_id] ?? "CampusConnect student",
      canTeach: row.can_teach,
      wantsToLearn: row.wants_to_learn,
      meetingMethod: asMeetingMethod(row.meeting_method),
      availability: row.availability,
      createdAt: row.created_at,
    })),
    hasMore: (data ?? []).length > shown,
  };
}
