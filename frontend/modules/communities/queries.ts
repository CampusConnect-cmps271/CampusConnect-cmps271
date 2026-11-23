import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndRole } from "@/lib/auth/server";
import { log } from "@/modules/logging";
import { getDisplayNames } from "@/modules/profiles";
import { communityIdSchema, communitySlugSchema, isCommunityTopic, TOPIC_LABELS } from "./schema";
import { directorySearchFilter, DIRECTORY_PAGE_SIZE, escapeLikePattern, POSTS_PAGE_SIZE, type DirectorySearch } from "./search";
import { suggestCommunities, type SuggestionPlan } from "./suggestions";
import type { CommunityPost, CommunitySummary, CourseOption, Membership, Suggestion } from "./types";

const OVERVIEW_COLUMNS =
  "id, slug, name, description, topic, course_id, course_code, course_name, owner_id, status, archived_at, created_at, member_count, follower_count, last_activity_at";

const POST_COLUMNS =
  "id, community_id, community_slug, community_name, author_id, title, body, category, created_at, edited_at, upvote_count, comment_count";

type OverviewRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  topic: string;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  owner_id: string;
  status: string;
  archived_at: string | null;
  created_at: string;
  member_count: number | null;
  follower_count: number | null;
  last_activity_at: string | null;
};

type PostRow = {
  id: string;
  community_id: string;
  community_slug: string;
  community_name: string;
  author_id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  edited_at: string | null;
  upvote_count: number | null;
  comment_count: number | null;
};

type Client = Awaited<ReturnType<typeof createClient>>;

function toSummary(row: OverviewRow): CommunitySummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    topic: isCommunityTopic(row.topic) ? row.topic : "other",
    courseId: row.course_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    ownerId: row.owner_id,
    status: row.status === "archived" ? "archived" : "active",
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    memberCount: Number(row.member_count ?? 0),
    followerCount: Number(row.follower_count ?? 0),
    lastActivityAt: row.last_activity_at ?? row.created_at,
  };
}

function failed(event: string, error: { code?: string } | null, context: Record<string, unknown> = {}): never {
  log.error(event, { ...context, code: error?.code ?? null });
  throw new Error("Failed to load communities.");
}

/** One community by its address, or null when there is none. */
export const getCommunityBySlug = cache(async (slug: string): Promise<CommunitySummary | null> => {
  if (!communitySlugSchema.safeParse(slug).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_overview")
    .select(OVERVIEW_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<OverviewRow>();
  if (error) failed("communities.read.failure", error);
  return data ? toSummary(data) : null;
});

/** The signed-in student's membership and follow for one community. */
export async function getMembership(communityId: string, userId: string): Promise<Membership> {
  const supabase = await createClient();
  const [member, follow] = await Promise.all([
    supabase
      .from("community_members")
      .select("role")
      .eq("community_id", communityId)
      .eq("student_id", userId)
      .maybeSingle<{ role: string }>(),
    supabase
      .from("community_follows")
      .select("community_id")
      .eq("community_id", communityId)
      .eq("student_id", userId)
      .maybeSingle(),
  ]);
  if (member.error) failed("communities.membership.read_failure", member.error, { communityId });
  if (follow.error) failed("communities.follow.read_failure", follow.error, { communityId });
  const role = member.data?.role;
  return {
    role: role === "owner" || role === "member" ? role : null,
    following: Boolean(follow.data),
  };
}

/** Whether the signed-in student is a moderator or an administrator. */
export async function isModeratorOrAdmin(): Promise<boolean> {
  const { role } = await getCurrentUserAndRole();
  return role === "moderator" || role === "administrator";
}

async function withAuthors(rows: PostRow[]): Promise<CommunityPost[]> {
  const names = await getDisplayNames(rows.map((row) => row.author_id));
  return rows.map((row) => ({
    id: row.id,
    communityId: row.community_id,
    communitySlug: row.community_slug,
    communityName: row.community_name,
    authorId: row.author_id,
    authorName: names[row.author_id] ?? null,
    title: row.title,
    body: row.body,
    category: row.category,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    upvoteCount: Number(row.upvote_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
  }));
}

/** Published community posts, newest first: from some communities, or from all of them when `communityIds` is null. */
async function postPage(
  communityIds: readonly string[] | null,
  pages: number,
  event: string,
): Promise<{ posts: CommunityPost[]; hasMore: boolean }> {
  if (communityIds?.length === 0) return { posts: [], hasMore: false };
  const supabase = await createClient();
  const shown = pages * POSTS_PAGE_SIZE;
  const all = supabase.from("community_post_feed").select(POST_COLUMNS);
  const filtered =
    communityIds === null
      ? all
      : communityIds.length === 1
        ? all.eq("community_id", communityIds[0])
        : all.in("community_id", [...communityIds]);
  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, shown)
    .returns<PostRow[]>();
  if (error) failed(event, error);
  const rows = data ?? [];
  return { posts: await withAuthors(rows.slice(0, shown)), hasMore: rows.length > shown };
}

/** A community's published posts, newest first, `pages` pages of them. */
export async function listCommunityPosts(communityId: string, pages = 1) {
  return postPage([communityId], pages, "communities.posts.read_failure");
}

/** The newest posts from the communities the student follows. */
export async function listFollowingFeed(userId: string, pages = 1) {
  const supabase = await createClient();
  const { data: follows, error } = await supabase
    .from("community_follows")
    .select("community_id")
    .eq("student_id", userId);
  if (error) failed("communities.follows.read_failure", error);
  const ids = (follows ?? []).map((row) => row.community_id as string);
  return postPage(ids, pages, "communities.following.read_failure");
}

/** The newest posts from every community, archived ones included. */
export async function listAllCommunityPosts(pages = 1) {
  return postPage(null, pages, "communities.all_posts.read_failure");
}

/** Ids of the communities the student joined or follows. */
async function myCommunityIds(supabase: Client, userId: string) {
  const [members, follows] = await Promise.all([
    supabase.from("community_members").select("community_id, role").eq("student_id", userId),
    supabase.from("community_follows").select("community_id").eq("student_id", userId),
  ]);
  if (members.error) failed("communities.mine.read_failure", members.error);
  if (follows.error) failed("communities.mine.read_failure", follows.error);
  const roles = new Map<string, Membership>();
  for (const row of members.data ?? []) {
    roles.set(row.community_id as string, { role: row.role === "owner" ? "owner" : "member", following: false });
  }
  for (const row of follows.data ?? []) {
    const id = row.community_id as string;
    roles.set(id, { role: roles.get(id)?.role ?? null, following: true });
  }
  return roles;
}

/** The communities the student joined or follows, active ones first, most recently active first. */
export async function listMyCommunities(
  userId: string,
): Promise<{ community: CommunitySummary; membership: Membership }[]> {
  const supabase = await createClient();
  const roles = await myCommunityIds(supabase, userId);
  if (roles.size === 0) return [];
  const { data, error } = await supabase
    .from("community_overview")
    .select(OVERVIEW_COLUMNS)
    .in("id", [...roles.keys()])
    .returns<OverviewRow[]>();
  if (error) failed("communities.mine.read_failure", error);
  return (data ?? [])
    .map(toSummary)
    .sort(
      (a, b) =>
        Number(a.status === "archived") - Number(b.status === "archived") ||
        b.lastActivityAt.localeCompare(a.lastActivityAt),
    )
    .map((community) => ({ community, membership: roles.get(community.id) ?? { role: null, following: false } }));
}

/** Active communities matching a search, `pages` pages of them. */
export async function discoverCommunities(search: DirectorySearch) {
  const supabase = await createClient();
  const shown = search.pages * DIRECTORY_PAGE_SIZE;
  let query = supabase.from("community_overview").select(OVERVIEW_COLUMNS).eq("status", "active");
  if (search.topic) query = query.eq("topic", search.topic);
  if (search.q) query = query.or(directorySearchFilter(search.q));
  query =
    search.sort === "active"
      ? query.order("last_activity_at", { ascending: false })
      : query.order("member_count", { ascending: false }).order("last_activity_at", { ascending: false });
  const { data, error } = await query.order("id").range(0, shown).returns<OverviewRow[]>();
  if (error) failed("communities.discover.read_failure", error);
  const rows = data ?? [];
  return { communities: rows.slice(0, shown).map(toSummary), hasMore: rows.length > shown };
}

/** Active communities for a course, most members first. */
export async function listCourseCommunities(courseId: string): Promise<CommunitySummary[]> {
  if (!communityIdSchema.safeParse(courseId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_overview")
    .select(OVERVIEW_COLUMNS)
    .eq("status", "active")
    .eq("course_id", courseId)
    .order("member_count", { ascending: false })
    .limit(10)
    .returns<OverviewRow[]>();
  if (error) failed("communities.course.read_failure", error);
  return (data ?? []).map(toSummary);
}

/** Catalogue courses matching a code ("CMPS 271", "cmps271") or a name. */
export async function searchCourses(query: string): Promise<CourseOption[]> {
  const text = query.replace(/\s+/g, " ").trim().slice(0, 60);
  if (text.length < 2) return [];
  const code = text.replace(/^([a-z]{2,8})\s*(\d{3,4}[a-z]{0,3})$/i, "$1 $2");
  const pattern = (value: string) => JSON.stringify(`%${escapeLikePattern(value)}%`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, code, name")
    .or(`code.ilike.${pattern(code)},name.ilike.${pattern(text)}`)
    .order("code")
    .limit(8)
    .returns<CourseOption[]>();
  if (error) failed("communities.courses.read_failure", error);
  return data ?? [];
}

/** A catalogue course by its code ("CMPS 271" or "CMPS-271"), or null. */
export async function findCourseByCode(code: string): Promise<CourseOption | null> {
  const normalized = code.replace(/[-\s]+/g, " ").trim().toUpperCase().slice(0, 32);
  if (!/^[A-Z]{2,8} \d{3,4}[A-Z]{0,3}$/.test(normalized)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, code, name")
    .eq("code", normalized)
    .maybeSingle<CourseOption>();
  if (error) failed("communities.courses.read_failure", error);
  return data ?? null;
}

/** The community a post was written in, or null for an ordinary post. */
export async function getPostCommunity(postId: string): Promise<{ slug: string; name: string } | null> {
  if (!communityIdSchema.safeParse(postId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_posts")
    .select("communities(slug, name)")
    .eq("post_id", postId)
    .maybeSingle<{ communities: { slug: string; name: string } | null }>();
  if (error) {
    // The post page must still render without it.
    log.error("communities.post_link.read_failure", { postId, code: error.code ?? null });
    return null;
  }
  return data?.communities ?? null;
}

function beirutToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(now);
}

type PlanRow = {
  term: string;
  starts_on: string;
  plan_courses: { course_id: string; position: number; courses: { code: string } | null }[] | null;
};

/**
 * Communities suggested for the signed-in student: for courses in their
 * current and upcoming plans, and for their profile interests. Reads only
 * the student's own plans and profile, with their own session, so row-level
 * security keeps every other student's out; the queries name the student
 * too. Leaves out communities they joined or follow. A part that cannot be
 * read is skipped: suggestions must never break the page.
 */
export async function listSuggestions(userId: string): Promise<Suggestion[]> {
  const supabase = await createClient();
  try {
    const [mine, plans, profile] = await Promise.all([
      myCommunityIds(supabase, userId),
      supabase
        .from("semester_plans")
        .select("term, starts_on, plan_courses(course_id, position, courses(code))")
        .eq("student_id", userId)
        .gte("ends_on", beirutToday())
        .order("starts_on", { ascending: true })
        .limit(3)
        .returns<PlanRow[]>(),
      supabase.from("profiles").select("interests").eq("id", userId).maybeSingle<{ interests: string[] | null }>(),
    ]);

    const planList: SuggestionPlan[] = plans.error
      ? []
      : (plans.data ?? []).map((plan) => ({
          term: plan.term,
          courses: [...(plan.plan_courses ?? [])]
            .sort((a, b) => a.position - b.position)
            .flatMap((planned) => (planned.courses ? [{ courseId: planned.course_id, code: planned.courses.code }] : [])),
        }));
    const interests = profile.error ? [] : (profile.data?.interests ?? []).filter((interest) => interest.trim().length >= 2);
    if (plans.error || profile.error) {
      log.warn("communities.suggestions.partial", { plans: Boolean(plans.error), profile: Boolean(profile.error) }, { userId });
    }

    const courseIds = [...new Set(planList.flatMap((plan) => plan.courses.map((course) => course.courseId)))];
    const topics = Object.entries(TOPIC_LABELS)
      .filter(([, label]) => interests.some((interest) => interest.trim().toLowerCase() === label.toLowerCase()))
      .map(([topic]) => topic);
    const nameFilters = interests.slice(0, 10).map((interest) => `name.ilike.${JSON.stringify(`%${escapeLikePattern(interest.trim())}%`)}`);

    const [byCourse, byInterest] = await Promise.all([
      courseIds.length
        ? supabase
            .from("community_overview")
            .select(OVERVIEW_COLUMNS)
            .eq("status", "active")
            .in("course_id", courseIds)
            .limit(50)
            .returns<OverviewRow[]>()
        : Promise.resolve({ data: [] as OverviewRow[], error: null }),
      nameFilters.length || topics.length
        ? supabase
            .from("community_overview")
            .select(OVERVIEW_COLUMNS)
            .eq("status", "active")
            .or([...nameFilters, ...(topics.length ? [`topic.in.(${topics.join(",")})`] : [])].join(","))
            .order("member_count", { ascending: false })
            .limit(50)
            .returns<OverviewRow[]>()
        : Promise.resolve({ data: [] as OverviewRow[], error: null }),
    ]);
    if (byCourse.error || byInterest.error) {
      log.warn("communities.suggestions.read_failure", { code: byCourse.error?.code ?? byInterest.error?.code ?? null }, { userId });
    }

    const candidates = [...(byCourse.data ?? []), ...(byInterest.data ?? [])]
      .map(toSummary)
      .filter((community) => !mine.has(community.id));
    return suggestCommunities({ plans: planList, interests, candidates });
  } catch {
    return [];
  }
}
