
export const NOTIFICATION_TYPES = [
  "message",
  "post_comment",
  "comment_reply",
  "content_removed",
  "event_reminder",
] as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[number];

/** One notification, with names and titles for display. */
export type NotificationItem = {
  id: string;
  type: NotificationType;

  /** Who performed the action, when applicable. */
  actorName: string | null;

  /** The title of a related post, when accessible. */
  postTitle: string | null;

  conversationId: string | null;
  postId: string | null;
  commentId: string | null;

  /** Event reminder metadata. */
  eventId?: string | null;
  eventTitle?: string | null;

  createdAt: string;
  read: boolean;
};

/** What the notification bell displays. */
export type NotificationSummary = {
  unreadCount: number;
  items: NotificationItem[];
};
