"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markAllNotificationsRead, markNotificationRead } from "../actions";
import { NOTIFICATIONS_CHANGED_EVENT } from "../events";
import { badgeText, bellLabel } from "../format";
import type { NotificationItem, NotificationSummary } from "../types";
import { NotificationList } from "./NotificationList";

/** Where the bell re-reads its count and list; see app/api/notifications. */
const SUMMARY_URL = "/api/notifications";

/** Several changes in a burst cause one reload, not one each. */
const RELOAD_DELAY_MS = 300;

// No display here: the phone link and the wider-screen button each set
// their own, so exactly one of them shows.
const BUTTON_CLASS =
  "relative items-center rounded-md p-1.5 text-[var(--ink-soft)] hover:bg-[var(--maroon-50)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

type NotificationBellProps = {
  userId: string;
  /** The unread count the server rendered, or null when it was unavailable. */
  initialCount: number | null;
};

/**
 * The header's bell. The count comes from the server, then stays current
 * through Realtime (the notifications RLS limits the feed to this student's
 * rows). On wider screens it opens a panel with the newest notifications; on
 * phones it links to /notifications.
 */
export function NotificationBell({ userId, initialCount }: NotificationBellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount ?? 0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // A refresh re-renders the header with a fresh count from the server.
  const [serverCount, setServerCount] = useState(initialCount);
  if (serverCount !== initialCount) {
    setServerCount(initialCount);
    if (initialCount !== null) setCount(initialCount);
  }

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const reloadRef = useRef<() => void>(() => {});

  // Re-reads the count and list; only the latest request may update them.
  useEffect(() => {
    async function reload() {
      const request = ++requestRef.current;
      try {
        const response = await fetch(SUMMARY_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const summary = (await response.json()) as NotificationSummary;
        if (request !== requestRef.current) return;
        setCount(summary.unreadCount);
        setItems(summary.items);
        setFailed(false);
      } catch {
        if (request === requestRef.current) setFailed(true);
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), RELOAD_DELAY_MS);
    };
    reloadRef.current = () => void reload();

    window.addEventListener("focus", schedule);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, schedule);

    // Inserts and updates only: deletes are retention and carry nothing new.
    // A fresh topic per mount, since the client reuses same-named channels.
    const supabase = createClient();
    let cancelled = false;
    const filter = `recipient_id=eq.${userId}`;
    const channel = supabase
      .channel(`notifications:${userId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, schedule)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, schedule);

    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe();
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", schedule);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, schedule);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // The panel closes on navigation.
  const [panelPath, setPanelPath] = useState(pathname);
  if (panelPath !== pathname) {
    setPanelPath(pathname);
    setOpen(false);
  }

  // Escape closes the panel and returns focus to the bell; so does a click
  // outside it (focus then stays where the click went).
  useEffect(() => {
    if (!open) return;

    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function toggle() {
    if (!open) reloadRef.current();
    setOpen(!open);
  }

  // A reload already in flight predates this change; let it be discarded,
  // then re-read once the server has the change.
  const discardPendingReloads = () => {
    requestRef.current += 1;
  };

  function openItem(item: NotificationItem, href: string) {
    setOpeningId(item.id);
    if (!item.read) {
      discardPendingReloads();
      setCount((current) => Math.max(0, current - 1));
      setItems((current) =>
        current?.map((other) => (other.id === item.id ? { ...other, read: true } : other)) ?? null,
      );
    }

    startTransition(async () => {
      if (!item.read) {
        await markNotificationRead(item.id).catch(() => null);
        reloadRef.current();
      }
      setOpeningId(null);
      setOpen(false);
      router.push(href);
    });
  }

  function markAllRead() {
    discardPendingReloads();
    setCount(0);
    setItems((current) => current?.map((item) => ({ ...item, read: true })) ?? null);
    startTransition(async () => {
      await markAllNotificationsRead().catch(() => null);
      reloadRef.current();
    });
  }

  const badge = badgeText(count);
  const icon = (
    <>
      <Bell aria-hidden="true" className="size-5" />
      {badge ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--maroon)] px-1 text-center text-[11px] font-semibold leading-5 text-white"
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="relative">
      <Link href="/notifications" aria-label={bellLabel(count)} className={`${BUTTON_CLASS} inline-flex sm:hidden`}>
        {icon}
      </Link>

      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={bellLabel(count)}
        aria-expanded={open}
        aria-controls="notifications-panel"
        className={`${BUTTON_CLASS} hidden sm:inline-flex`}
      >
        {icon}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id="notifications-panel"
          role="dialog"
          aria-labelledby="notifications-panel-heading"
          tabIndex={-1}
          className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-lg focus:outline-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <h2 id="notifications-panel-heading" className="text-sm font-semibold">
              Notifications
            </h2>
            <button
              type="button"
              onClick={markAllRead}
              disabled={count === 0}
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--maroon)] hover:bg-[var(--maroon-50)] disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
            >
              Mark all as read
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-center text-sm text-gray-600" role="status">
                {failed ? "Notifications are unavailable right now." : "Loading…"}
              </p>
            ) : (
              <NotificationList items={items} onOpen={openItem} openingId={openingId} />
            )}
          </div>

          <div className="border-t border-gray-200 px-4 py-2 text-center">
            <Link href="/notifications" className="text-sm font-medium text-blue-700 hover:underline">
              See all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
