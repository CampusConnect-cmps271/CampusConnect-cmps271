export const NOTIFICATION_TYPES = [
  "message",
  "post_comment",
  "comment_reply",
  "content_removed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** One notification, with the names and title its sentence needs. */
export type NotificationItem = {
  id: string;
  type: NotificationType;
  /** Who did it; null for a moderator, or when their name cannot be read. */
  actorName: string | null;
  /** The post's title, when the student can still read the post. */
  postTitle: string | null;
  conversationId: string | null;
  postId: string | null;
  commentId: string | null;
  createdAt: string;
  read: boolean;
};

/** What the bell shows. */
export type NotificationSummary = {
  unreadCount: number;
  items: NotificationItem[];
};
