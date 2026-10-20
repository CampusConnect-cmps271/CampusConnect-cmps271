"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Several messages in a burst cause one refresh, not one each. */
const REFRESH_DELAY_MS = 300;

/**
 * Keeps the inbox current: re-renders it when a message arrives in any of
 * the student's conversations (RLS limits the Realtime feed to those), and
 * when the tab regains focus. Renders nothing.
 */
export function InboxLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    // A fresh topic per mount: the client reuses a channel with the same
    // name, and the previous one may still be closing.
    const channel = supabase
      .channel(`inbox:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        refresh,
      );

    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe();
    });

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
