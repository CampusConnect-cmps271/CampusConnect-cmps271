import type { NotificationItem } from "./types";

/** Longest post title quoted in a sentence, in characters. */
export const TITLE_LENGTH = 60;

/** Where a comment notification lands: the comments section of the post. */
export const COMMENTS_ANCHOR = "comments-heading";

/** Who did it, when the name is unknown. */
const SOMEONE = "A student";

function quote(title: string): string {
  const line = title.replace(/\s+/g, " ").trim();
  const short = line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
  return `"${short}"`;
}

/**
 * The sentence for a notification. Built from the type, the actor's name and
 * the post's title; notifications never carry message or comment text.
 */
export function notificationSentence(
  item: Pick<NotificationItem, "type" | "actorName" | "postTitle" | "postId">,
): string {
  const actor = item.actorName?.trim() || SOMEONE;
  const title = item.postTitle?.trim() ? ` ${quote(item.postTitle)}` : "";

  switch (item.type) {
    case "message":
      return `${actor} sent you a message`;
    case "post_comment":
      return `${actor} commented on your post${title}`;
    case "comment_reply":
      return `${actor} replied to your comment`;
    case "content_removed":
      return item.postId
        ? `Your post${title} was removed by a moderator`
        : "Your comment was removed by a moderator";
  }
}

/** The bell's badge: nothing for zero, the count up to nine, then "9+". */
export function badgeText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 9 ? "9+" : String(Math.floor(count));
}

/** The bell's accessible name, which includes the count. */
export function bellLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "Notifications";
  return `Notifications, ${Math.floor(count)} unread`;
}

/**
 * Where opening a notification goes. Removed content has nothing left to
 * show, so it opens a short notice on the notifications page instead.
 */
export function notificationHref(
  item: Pick<NotificationItem, "id" | "type" | "conversationId" | "postId">,
): string {
  switch (item.type) {
    case "message":
      return item.conversationId ? `/messages/${item.conversationId}` : "/messages";
    case "post_comment":
    case "comment_reply":
      return item.postId ? `/posts/${item.postId}#${COMMENTS_ANCHOR}` : "/notifications";
    case "content_removed":
      return `/notifications?removed=${item.id}`;
  }
}

/**
 * When a notification happened, e.g. "Oct 18, 2:05 PM". Fixed to the campus
 * time zone so the server and every browser render the same text.
 */
export function formatNotificationTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Beirut",
  }).format(new Date(isoDate));
}
