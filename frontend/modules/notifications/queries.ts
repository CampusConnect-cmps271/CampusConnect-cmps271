
import "server-only";

import * as z from "zod";

import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { getDisplayNames } from "@/modules/profiles";
import { createClient } from "@/lib/supabase/server";

import {
  NOTIFICATION_TYPES,
  type NotificationItem,
  type NotificationSummary,
  type NotificationType,
} from "./types";

/** Number of notifications in the bell and notifications page. */
export const NOTIFICATIONS_SHOWN = 20;

const NOTIFICATION_COLUMNS =
  "id, type, actor_id, conversation_id, post_id, comment_id, event_id, created_at, read_at";

type NotificationRow = {
  id: string;
  type: string;
  actor_id: string | null;
  conversation_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  event_id: string | null;
  created_at: string;
  read_at: string | null;
};

type SupabaseServerClient =
  Awaited<ReturnType<typeof createClient>>;

const isKnownType = (
  type: string,
): type is NotificationType =>
  (NOTIFICATION_TYPES as readonly string[]).includes(type);

/** Read titles only for posts accessible to the student. */
async function readPostTitles(
  supabase: SupabaseServerClient,
  postIds: string[],
): Promise<Record<string, string>> {
  if (postIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("posts")
    .select("id, title")
    .in("id", postIds);

  if (error || !data) {
    log.error("notifications.post_titles.read_failure", {
      count: postIds.length,
      code: error?.code ?? null,
    });

    return {};
  }

  return Object.fromEntries(
    (data as { id: string; title: string }[]).map(
      (row) => [row.id, row.title],
    ),
  );
}

/** Read titles only for events accessible through RLS. */
async function readEventTitles(
  supabase: SupabaseServerClient,
  eventIds: string[],
): Promise<Record<string, string>> {
  if (eventIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("events")
    .select("id, title")
    .in("id", eventIds)
    .eq("status", "published");

  if (error || !data) {
    log.error("notifications.event_titles.read_failure", {
      count: eventIds.length,
      code: error?.code ?? null,
    });

    return {};
  }

  return Object.fromEntries(
    (data as { id: string; title: string }[]).map(
      (row) => [row.id, row.title],
    ),
  );
}

/** Build notification items with accessible names and titles. */
async function toItems(
  supabase: SupabaseServerClient,
  rows: NotificationRow[],
): Promise<NotificationItem[]> {
  const known = rows.filter(
    (row) => isKnownType(row.type),
  );

  const actorIds = [
    ...new Set(
      known.flatMap((row) =>
        row.actor_id ? [row.actor_id] : [],
      ),
    ),
  ];

  const postIds = [
    ...new Set(
      known.flatMap((row) =>
        row.post_id ? [row.post_id] : [],
      ),
    ),
  ];

  const eventIds = [
    ...new Set(
      known.flatMap((row) =>
        row.type === "event_reminder" && row.event_id
          ? [row.event_id]
          : [],
      ),
    ),
  ];

  const [names, postTitles, eventTitles] =
    await Promise.all([
      getDisplayNames(actorIds),
      readPostTitles(supabase, postIds),
      readEventTitles(supabase, eventIds),
    ]);

  return known.map((row) => ({
    id: row.id,
    type: row.type as NotificationType,

    actorName: row.actor_id
      ? (names[row.actor_id] ?? null)
      : null,

    postTitle: row.post_id
      ? (postTitles[row.post_id] ?? null)
      : null,

    conversationId: row.conversation_id,
    postId: row.post_id,
    commentId: row.comment_id,

    eventId: row.event_id,

    eventTitle: row.event_id
      ? (eventTitles[row.event_id] ?? null)
      : null,

    createdAt: row.created_at,
    read: row.read_at !== null,
  }));
}

/**
 * Read the signed-in student's unread count.
 * The header continues rendering if this query fails.
 */
export async function countMyUnreadNotifications():
  Promise<number | null> {
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

/** Read the signed-in student's newest notifications. */
export async function listMyNotifications():
  Promise<NotificationItem[]> {
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

    throw new Error(
      "Failed to load your notifications.",
    );
  }

  return toItems(
    supabase,
    (data ?? []) as NotificationRow[],
  );
}

/** Read the bell's unread count and latest notifications. */
export async function getMyNotificationSummary():
  Promise<NotificationSummary> {
  const [unreadCount, items] = await Promise.all([
    countMyUnreadNotifications(),
    listMyNotifications(),
  ]);

  return {
    unreadCount:
      unreadCount ??
      items.filter((item) => !item.read).length,

    items,
  };
}

/** Read one notification, scoped to the current student. */
export async function getMyNotification(
  id: string,
): Promise<NotificationItem | null> {
  if (!z.uuid().safeParse(id).success) {
    return null;
  }

  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("id", id)
    .eq("recipient_id", user.id)
    .maybeSingle<NotificationRow>();

  if (error || !data) {
    return null;
  }

  const [item] = await toItems(supabase, [data]);

  return item ?? null;
}
