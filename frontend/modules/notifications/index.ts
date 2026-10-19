/**
 * Public API of the notifications module. Import from
 * "@/modules/notifications", never from a file inside it.
 *
 * Note: this barrel re-exports server-only code, so a Client Component must
 * not import it. Client Components inside the module import their siblings
 * directly.
 */

export { markAllNotificationsRead, markNotificationRead } from "./actions";

export {
  countMyUnreadNotifications,
  getMyNotification,
  getMyNotificationSummary,
  listMyNotifications,
  NOTIFICATIONS_SHOWN,
} from "./queries";

export { NOTIFICATIONS_CHANGED_EVENT } from "./events";

export {
  badgeText,
  bellLabel,
  COMMENTS_ANCHOR,
  formatNotificationTime,
  notificationHref,
  notificationSentence,
  TITLE_LENGTH,
} from "./format";

export {
  NOTIFICATION_TYPES,
  type NotificationItem,
  type NotificationSummary,
  type NotificationType,
} from "./types";

export { NotificationBell } from "./components/NotificationBell";
export { NotificationCenter } from "./components/NotificationCenter";
