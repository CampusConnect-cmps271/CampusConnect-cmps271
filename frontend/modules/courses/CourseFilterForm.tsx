"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./courses.module.css";

export function CourseFilterForm({ children }: { children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let frame = 0;
    const restoreUrlValues = () => {
      cancelAnimationFrame(frame);
      // Browsers can restore dirty input values after a history event even
      // though this document's default values and results belong to its URL.
      frame = requestAnimationFrame(() => form.current?.reset());
    };
    window.addEventListener("pageshow", restoreUrlValues);
    window.addEventListener("popstate", restoreUrlValues);
    // A full document navigation can restore inputs before hydration attaches
    // these listeners. Also reconcile once when this form mounts.
    restoreUrlValues();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", restoreUrlValues);
      window.removeEventListener("popstate", restoreUrlValues);
    };
  }, []);

  return <form ref={form} action="/courses" method="get" className={styles.form}
    role="search" aria-label="Course catalogue">{children}</form>;
}

export function ClearCourseFilters() {
  return <Link href="/courses" className={styles.clear}
    onClick={(event) => event.currentTarget.closest("form")?.reset()}>Clear</Link>;
}
