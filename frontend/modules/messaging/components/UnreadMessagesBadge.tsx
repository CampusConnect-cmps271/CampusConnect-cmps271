"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MESSAGES_READ_EVENT } from "../events";

/** Where the badge re-reads the count; see app/api/messages/unread-count. */
const UNREAD_COUNT_URL = "/api/messages/unread-count";

/**
 * The unread count beside "Messages" in the header. The header's layout does
 * not re-render on navigation, so the badge re-reads the count itself: after
 * each navigation, when the tab regains focus, and when a conversation is
 * marked read. Shows nothing for zero or when the count is unknown.
 */
export function UnreadMessagesBadge({ initialCount }: { initialCount: number | null }) {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);

  // A refresh re-renders the header with a fresh count from the server.
  const [serverCount, setServerCount] = useState(initialCount);
  if (serverCount !== initialCount) {
    setServerCount(initialCount);
    setCount(initialCount);
  }

  const requestRef = useRef(0);
  const reloadRef = useRef<() => void>(() => {});

  useEffect(() => {
    async function reload() {
      const request = ++requestRef.current;
      try {
        const response = await fetch(UNREAD_COUNT_URL, { cache: "no-store" });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const next = (body as { count?: unknown }).count;
        // Only the latest request may update the badge.
        if (request === requestRef.current && (typeof next === "number" || next === null)) {
          setCount(next);
        }
      } catch {
        // Keep the last known count; the next trigger tries again.
      }
    }

    reloadRef.current = () => void reload();

    const reloadWhenVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };

    window.addEventListener(MESSAGES_READ_EVENT, reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reloadWhenVisible);

    return () => {
      window.removeEventListener(MESSAGES_READ_EVENT, reload);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reloadWhenVisible);
    };
  }, []);

  // After a client-side navigation (not the first render, which the server
  // already counted), re-read the count.
  const lastPathRef = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;
    reloadRef.current();
  }, [pathname]);

  if (!count) return null;

  return (
    <>
      <span
        aria-hidden="true"
        className="min-w-5 rounded-full bg-[var(--maroon)] px-1.5 text-center text-xs font-semibold leading-5 text-white"
      >
        {count > 99 ? "99+" : count}
      </span>
      <span className="sr-only">({count} unread)</span>
    </>
  );
}
