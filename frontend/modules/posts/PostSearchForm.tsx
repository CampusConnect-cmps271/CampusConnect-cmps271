"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./post-search.module.css";

export function PostSearchForm({ query = "", showClear = false }: { query?: string; showClear?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let frame = 0;
    const restore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => form.current?.reset());
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) restore(); };
    // Normal first loads must preserve typing that started before hydration.
    // Only history restoration can have stale values belonging to another URL.
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === "back_forward") restore();
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", restore);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", restore);
    };
  }, [query]);
  return <form ref={form} action="/search" method="get" role="search" aria-label="Search campus posts" className={styles.form}>
    <div className={styles.field}>
      <label htmlFor="post-search">Search posts by keyword</label>
      <input id="post-search" name="q" type="search" dir="auto" defaultValue={query}
        placeholder="e.g. library hours or المكتبة" aria-describedby="post-search-hint" />
      <p id="post-search-hint" className={styles.hint}>Search English or Arabic keywords. All words must match. Uses up to 200 characters.</p>
    </div>
    <div className={styles.actions}>
      <button type="submit" className={styles.primary}>Search posts</button>
      {showClear && <Link href="/search" onClick={() => form.current?.reset()}>Clear search</Link>}
    </div>
  </form>;
}
