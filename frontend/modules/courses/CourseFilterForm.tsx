"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./courses.module.css";

// Set once the form that came with the document's HTML has been reconciled.
// Forms rendered after a client-side navigation start from their defaults.
let documentFormReconciled = false;

/** Back/forward and reload document loads are when browsers restore inputs. */
function restoredDocumentLoad() {
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entry?.type === "back_forward" || entry?.type === "reload";
}

export function CourseFilterForm({ children }: { children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let frame = 0;
    const restoreUrlValues = () => {
      cancelAnimationFrame(frame);
      // Browsers can restore dirty input values after a history event even
      // though this document's default values and results belong to its URL.
      frame = requestAnimationFrame(() => {
        documentFormReconciled = true;
        form.current?.reset();
      });
    };
    const restoreFromCache = (event: PageTransitionEvent) => {
      if (event.persisted) restoreUrlValues();
    };
    window.addEventListener("pageshow", restoreFromCache);
    window.addEventListener("popstate", restoreUrlValues);
    // A back/forward or reload document load can restore inputs before
    // hydration attaches these listeners, so reconcile once on mount. Only
    // then: the reset lands a frame later and would wipe what a student
    // typed while the page was loading.
    if (!documentFormReconciled && restoredDocumentLoad()) restoreUrlValues();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", restoreFromCache);
      window.removeEventListener("popstate", restoreUrlValues);
    };
  }, []);

  return <form ref={form} action="/courses" method="get" className={styles.form}
    role="search" aria-label="Course catalogue">{children}</form>;
}

export function ClearCourseFilters({ href = "/courses" }: { href?: string }) {
  return <Link href={href} className={styles.clear}
    onClick={(event) => event.currentTarget.closest("form")?.reset()}>Clear</Link>;
}
