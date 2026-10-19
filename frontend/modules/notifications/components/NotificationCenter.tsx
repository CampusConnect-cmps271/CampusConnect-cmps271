"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllNotificationsRead, markNotificationRead } from "../actions";
import { NOTIFICATIONS_CHANGED_EVENT } from "../events";
import type { NotificationItem } from "../types";
import { NotificationList } from "./NotificationList";

const announceChange = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));

/** The /notifications page's list, with "Mark all as read". */
export function NotificationCenter({ initialItems }: { initialItems: NotificationItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // A refresh re-renders the page with the server's list.
  const [serverItems, setServerItems] = useState(initialItems);
  if (serverItems !== initialItems) {
    setServerItems(initialItems);
    setItems(initialItems);
  }

  const unread = items.filter((item) => !item.read).length;

  function openItem(item: NotificationItem, href: string) {
    setOpeningId(item.id);
    startTransition(async () => {
      if (!item.read) {
        await markNotificationRead(item.id).catch(() => null);
        announceChange();
      }
      setOpeningId(null);
      router.push(href);
    });
  }

  function markAllRead() {
    setError("");
    const before = items;
    setItems((current) => current.map((item) => ({ ...item, read: true })));

    startTransition(async () => {
      const result = await markAllNotificationsRead().catch(() => ({ ok: false }));
      if (result.ok) {
        announceChange();
      } else {
        setItems(before);
        setError("We couldn't mark your notifications as read. Please try again.");
      }
    });
  }

  return (
    <section
      aria-labelledby="notifications-heading"
      className="overflow-hidden rounded-lg bg-white text-gray-900 shadow-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <h2 id="notifications-heading" className="text-base font-semibold">
          {unread > 0 ? `${unread} unread` : "All read"}
        </h2>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unread === 0 || pending}
          className="rounded-md px-2 py-1 text-sm font-medium text-[var(--maroon)] hover:bg-[var(--maroon-50)] disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
        >
          Mark all as read
        </button>
      </div>

      {error ? (
        <p role="alert" className="px-4 pt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <NotificationList items={items} onOpen={openItem} openingId={openingId} />
    </section>
  );
}
