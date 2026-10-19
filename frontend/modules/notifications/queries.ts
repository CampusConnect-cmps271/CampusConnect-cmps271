import "server-only";
import * as z from "zod";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { getDisplayNames } from "@/modules/profiles";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_TYPES, type NotificationItem, type NotificationSummary, type NotificationType } from "./types";

/** How many notifications the bell and the notifications page show. */
export const NOTIFICATIONS_SHOWN = 20;

const NOTIFICATION_COLUMNS =
  "id, type, actor_id, conversation_id, post_id, comment_id, created_at, read_at";

type NotificationRow = {
  id: string;
  type: string;
  actor_id: string | null;
  conversation_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  created_at: string;
  read_at: string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const isKnownType = (type: string): type is NotificationType =>
  (NOTIFICATION_TYPES as readonly string[]).includes(type);

/** Titles of the posts the student can still read, keyed by id. */
async function readPostTitles(
  supabase: SupabaseServerClient,
  postIds: string[],
): Promise<Record<string, string>> {
  if (postIds.length === 0) return {};

  const { data, error } = await supabase.from("posts").select("id, title").in("id", postIds);

  if (error || !data) {
    log.error("notifications.post_titles.read_failure", {
      count: postIds.length,
      code: error?.code ?? null,
    });
    return {};
  }

  return Object.fromEntries(
    (data as { id: string; title: string }[]).map((row) => [row.id, row.title]),
  );
}

/** Rows with the actor's name and the post's title for their sentences. */
async function toItems(
  supabase: SupabaseServerClient,
  rows: NotificationRow[],
): Promise<NotificationItem[]> {
  const known = rows.filter((row) => isKnownType(row.type));
  const actorIds = known.flatMap((row) => (row.actor_id ? [row.actor_id] : []));
  const postIds = [...new Set(known.flatMap((row) => (row.post_id ? [row.post_id] : [])))];

  const [names, titles] = await Promise.all([
    getDisplayNames(actorIds),
    readPostTitles(supabase, postIds),
  ]);

  return known.map((row) => ({
    id: row.id,
    type: row.type as NotificationType,
    actorName: row.actor_id ? (names[row.actor_id] ?? null) : null,
    postTitle: row.post_id ? (titles[row.post_id] ?? null) : null,
    conversationId: row.conversation_id,
    postId: row.post_id,
    commentId: row.comment_id,
    createdAt: row.created_at,
    read: row.read_at !== null,
  }));
}

/**
 * How many unread notifications the signed-in student has, or null when it
 * cannot be read. Never throws: the header must render regardless.
 */
export async function countMyUnreadNotifications(): Promise<number | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error || typeof count !== "number") {
    log.error(
      "notifications.unread_count.read_failure",
      { code: error?.code ?? "no_count" },
      { userId: user.id },
    );
    return null;
  }

  return count;
}

/** The signed-in student's newest notifications, read or not. */
export async function listMyNotifications(): Promise<NotificationItem[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_SHOWN);

  if (error) {
    log.error(
      "notifications.list.read_failure",
      { code: error.code ?? null },
      { userId: user.id },
    );
    throw new Error("Failed to load your notifications.");
  }

  return toItems(supabase, (data ?? []) as NotificationRow[]);
}

/** The unread count and newest notifications, for the bell. */
export async function getMyNotificationSummary(): Promise<NotificationSummary> {
  const [unreadCount, items] = await Promise.all([
    countMyUnreadNotifications(),
    listMyNotifications(),
  ]);

  return {
    unreadCount: unreadCount ?? items.filter((item) => !item.read).length,
    items,
  };
}

/** One of the signed-in student's notifications, or null (RLS hides others'). */
export async function getMyNotification(id: string): Promise<NotificationItem | null> {
  if (!z.uuid().safeParse(id).success) return null;

  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("id", id)
    .eq("recipient_id", user.id)
    .maybeSingle<NotificationRow>();

  if (error || !data) return null;

  const [item] = await toItems(supabase, [data]);
  return item ?? null;
}
