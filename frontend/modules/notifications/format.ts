
import type { NotificationItem } from "./types";

/** Longest title quoted in a notification sentence. */
export const TITLE_LENGTH = 60;

/** Destination for comment and reply notifications. */
export const COMMENTS_ANCHOR = "comments-heading";

const SOMEONE = "A student";

function quote(title: string): string {
  const line = title.replace(/\s+/g, " ").trim();

  const short =
    line.length > TITLE_LENGTH
      ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…`
      : line;

  return `"${short}"`;
}

/** Build a notification message without exposing private content. */
export function notificationSentence(
  item: Pick<
    NotificationItem,
    "type" | "actorName" | "postTitle" | "postId"
  > & Pick<NotificationItem, "eventTitle">,
): string {
  const actor = item.actorName?.trim() || SOMEONE;

  const title = item.postTitle?.trim()
    ? ` ${quote(item.postTitle)}`
    : "";

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

    case "event_reminder": {
      const eventName = item.eventTitle?.trim();

      return eventName
        ? `Event reminder: ${quote(eventName)} is coming up`
        : "An event you saved is coming up";
    }
  }
}

/** Short unread count for the bell badge. */
export function badgeText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return "";
  }

  return count > 9
    ? "9+"
    : String(Math.floor(count));
}

/** Accessible label for the notification bell. */
export function bellLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return "Notifications";
  }

  return `Notifications, ${Math.floor(count)} unread`;
}

/** Link to the relevant content for each notification. */
export function notificationHref(
  item: Pick<
    NotificationItem,
    "id" | "type" | "conversationId" | "postId"
  > & Pick<NotificationItem, "eventId">,
): string {
  switch (item.type) {
    case "message":
      return item.conversationId
        ? `/messages/${item.conversationId}`
        : "/messages";

    case "post_comment":
    case "comment_reply":
      return item.postId
        ? `/posts/${item.postId}#${COMMENTS_ANCHOR}`
        : "/notifications";

    case "content_removed":
      return `/notifications?removed=${item.id}`;

    case "event_reminder":
      return item.eventId
        ? `/events/${item.eventId}`
        : "/events";
  }
}

/** Display notification timestamps in Beirut time. */
export function formatNotificationTime(
  isoDate: string,
): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Beirut",
  }).format(new Date(isoDate));
}
