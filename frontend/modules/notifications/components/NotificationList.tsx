"use client";

import { formatNotificationTime, notificationHref, notificationSentence } from "../format";
import type { NotificationItem } from "../types";

type NotificationListProps = {
  items: NotificationItem[];
  /** Marks the item read and goes to it. */
  onOpen: (item: NotificationItem, href: string) => void;
  /** The item being opened, shown as busy. */
  openingId?: string | null;
};

/** Notifications, newest first; unread ones stand out. */
export function NotificationList({ items, onOpen, openingId = null }: NotificationListProps) {
  if (items.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-gray-600">You&apos;re all caught up.</p>;
  }

  return (
    <ul aria-label="Notifications" className="divide-y divide-gray-200">
      {items.map((item) => {
        const href = notificationHref(item);

        return (
          <li key={item.id}>
            <a
              href={href}
              onClick={(event) => {
                // Let new-tab and modifier clicks behave as links.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onOpen(item, href);
              }}
              aria-busy={openingId === item.id || undefined}
              className={`flex items-start gap-3 px-4 py-3 text-sm hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--maroon)] ${
                item.read ? "text-gray-700" : "bg-[var(--maroon-50)] font-semibold text-gray-900"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-[var(--maroon)]"}`}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="break-words">
                  {item.read ? null : <span className="sr-only">Unread: </span>}
                  {notificationSentence(item)}
                </span>
                <time dateTime={item.createdAt} className="text-xs font-normal text-gray-500">
                  {formatNotificationTime(item.createdAt)}
                </time>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
