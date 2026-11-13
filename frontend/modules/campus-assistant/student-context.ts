import type { SupabaseClient } from "@supabase/supabase-js";
import { beirutIsoDay, formatBeirutDay, formatBeirutTime } from "./beirut-time";
import type { EvidenceChunk } from "./schema";

/**
 * The signed-in student's own plan, saved events and posts, as evidence for one
 * question (SCRUM-255).
 *
 * This is private data, so it is handled differently from the shared campus
 * content:
 * - It is read at request time with the student's own session, so row-level
 *   security already hides every other student's rows, and each query also asks
 *   for the student's id explicitly as a second lock.
 * - It is never written to the search index or embedded; it lives for one request.
 * - It is read only for questions about the student themselves (see personal.ts).
 * - Only short fields are read (titles, categories, times), never post bodies, and
 *   the lists are capped.
 * - Everything a student typed is flattened to one capped line, because the text
 *   is shown to a model as data and must not pass for an instruction.
 */

type Client = Pick<SupabaseClient, "from">;

type Section = "plan" | "events" | "saved-posts" | "my-posts" | "feed";

export type StudentContext = {
  chunks: EvidenceChunk[];
  /** Parts that could not be read. Names only: never database text or any of the student's data. */
  failed: Section[];
};

const MAX_PLANS = 2;
const MAX_ITEMS = 10;
const MAX_EVENTS = 10;
const MAX_SAVED_POSTS = 10;
const MAX_OWN_POSTS = 5;
const MAX_FEED_POSTS = 5;
const TEXT_MAX = 120;

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Student-typed text on one line, without control characters, cut to a fixed length. */
function clean(text: string | null | undefined, max = TEXT_MAX): string {
  return (text ?? "").replace(/[\p{Cc}\p{Cf}\s]+/gu, " ").trim().slice(0, max);
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

type Meeting = { weekday: number; start_minute: number; end_minute: number };
type PlanRow = {
  id: string;
  term: string;
  starts_on: string;
  ends_on: string;
  plan_courses: {
    position: number;
    courses: { code: string; name: string } | null;
    plan_meetings: Meeting[] | null;
  }[] | null;
  plan_items: { title: string; on_date: string; start_minute: number | null; end_minute: number | null }[] | null;
};

type SavedEventRow = {
  events: { id: string; title: string; starts_at: string; ends_at: string; location: string; status: string } | null;
  going_events: unknown;
};

type PostRow = { id: string; title: string; category: string };
type SavedPostRow = { posts: (PostRow & { status: string }) | null };

function planChunk(plan: PlanRow, now: Date, today: string): EvidenceChunk {
  const courses = [...(plan.plan_courses ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((planned) => {
      const meetings = [...(planned.plan_meetings ?? [])]
        .sort((a, b) => a.weekday - b.weekday || a.start_minute - b.start_minute)
        .map((meeting) => `${WEEKDAYS[meeting.weekday] ?? "?"} ${clock(meeting.start_minute)}-${clock(meeting.end_minute)}`);
      const name = planned.courses ? `${clean(planned.courses.code, 20)} ${clean(planned.courses.name)}` : "Unavailable course";
      return `- ${name}: ${meetings.length > 0 ? meetings.join(", ") : "no meeting times entered"}`;
    });
  const items = [...(plan.plan_items ?? [])]
    .filter((item) => item.on_date >= today)
    .sort((a, b) => a.on_date.localeCompare(b.on_date) || (a.start_minute ?? -1) - (b.start_minute ?? -1))
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const when = item.start_minute === null || item.end_minute === null ? "(all day)" : `${clock(item.start_minute)}-${clock(item.end_minute)}`;
      return `- ${item.on_date} ${clean(item.title)} ${when}`;
    });

  const lines = [
    `Today is ${formatBeirutDay(now)} (Beirut time).`,
    `Your ${clean(plan.term, 20)} plan (${plan.starts_on} to ${plan.ends_on}). Meeting times were typed by the student and are tentative.`,
    courses.length > 0 ? `Courses:\n${courses.join("\n")}` : "No courses in this plan yet.",
    items.length > 0 ? `Upcoming items:\n${items.join("\n")}` : "No upcoming items.",
  ];
  return {
    chunk_id: `me:plan:${plan.id}`,
    source_id: "student-plan",
    url: `/planner/${plan.id}`,
    title: `Your ${clean(plan.term, 20)} plan`,
    retrieved_at: null,
    text: lines.join("\n"),
  };
}

function isGoing(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function eventsChunk(rows: SavedEventRow[], now: Date): EvidenceChunk | null {
  const upcoming = rows
    .flatMap((row) => (row.events ? [{ event: row.events, going: isGoing(row.going_events) }] : []))
    .filter(({ event }) => event.status === "published" && new Date(event.ends_at) >= now)
    .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at))
    .slice(0, MAX_EVENTS);
  if (upcoming.length === 0) return null;

  const lines = upcoming.map(
    ({ event, going }) =>
      `- ${clean(event.title)}, ${formatBeirutTime(event.starts_at)}, ${clean(event.location)}${going ? " (going)" : ""}`,
  );
  return {
    chunk_id: "me:events",
    source_id: "student-events",
    url: "/events",
    title: "Your saved events",
    retrieved_at: null,
    text: `Today is ${formatBeirutDay(now)} (Beirut time).\nUpcoming events the student saved ("going" means they marked it):\n${lines.join("\n")}`,
  };
}

function postsChunk(id: string, source: string, url: string, title: string, intro: string, posts: PostRow[]): EvidenceChunk | null {
  if (posts.length === 0) return null;
  const lines = posts.map((post) => `- ${clean(post.title)} (${clean(post.category, 40)})`);
  return { chunk_id: id, source_id: source, url, title, retrieved_at: null, text: `${intro}\n${lines.join("\n")}` };
}

/**
 * Reads the student's private context. Each part is independent: one that cannot
 * be read is skipped and named in `failed`, and the rest is still returned.
 */
export async function loadStudentContext(client: Client, userId: string, now: Date = new Date()): Promise<StudentContext> {
  const today = beirutIsoDay(now);
  const failed: Section[] = [];

  async function part(name: Section, read: () => PromiseLike<EvidenceChunk[]>): Promise<EvidenceChunk[]> {
    try {
      return await read();
    } catch {
      failed.push(name);
      return [];
    }
  }
  const check = <T>(result: { data: T | null; error: unknown }): T => {
    if (result.error) throw new Error("read failed");
    return result.data ?? ([] as unknown as T);
  };

  const parts = await Promise.all([
    part("plan", async () => {
      const rows = check(
        await client
          .from("semester_plans")
          .select(
            "id, term, starts_on, ends_on, plan_courses(position, courses(code, name), plan_meetings(weekday, start_minute, end_minute)), plan_items(title, on_date, start_minute, end_minute)",
          )
          .eq("student_id", userId)
          .gte("ends_on", today)
          .order("starts_on", { ascending: true })
          .limit(MAX_PLANS)
          .returns<PlanRow[]>(),
      );
      return rows.map((plan) => planChunk(plan, now, today));
    }),
    part("events", async () => {
      const rows = check(
        await client
          .from("saved_events")
          .select("event_id, events(id, title, starts_at, ends_at, location, status), going_events(event_id)")
          .eq("student_id", userId)
          .returns<SavedEventRow[]>(),
      );
      const chunk = eventsChunk(rows, now);
      return chunk ? [chunk] : [];
    }),
    part("saved-posts", async () => {
      const rows = check(
        await client
          .from("saved_posts")
          .select("created_at, posts(id, title, category, status)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(MAX_SAVED_POSTS)
          .returns<SavedPostRow[]>(),
      );
      const posts = rows.flatMap((row) => (row.posts && row.posts.status === "published" ? [row.posts] : []));
      const chunk = postsChunk("me:saved-posts", "student-posts", "/saved", "Your saved posts", "Posts the student saved (newest save first):", posts);
      return chunk ? [chunk] : [];
    }),
    part("my-posts", async () => {
      const posts = check(
        await client
          .from("posts")
          .select("id, title, category, created_at")
          .eq("author_id", userId)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(MAX_OWN_POSTS)
          .returns<PostRow[]>(),
      );
      const chunk = postsChunk("me:my-posts", "student-posts", "/profile", "Your posts", "Posts the student wrote (newest first):", posts);
      return chunk ? [chunk] : [];
    }),
    part("feed", async () => {
      const posts = check(
        await client
          .from("posts")
          .select("id, title, category, created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(MAX_FEED_POSTS)
          .returns<PostRow[]>(),
      );
      const chunk = postsChunk("me:feed", "campus-feed", "/home", "Recent posts on the feed", "The newest public posts on the CampusConnect feed:", posts);
      return chunk ? [chunk] : [];
    }),
  ]);

  return { chunks: parts.flat(), failed };
}
