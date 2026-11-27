"use client";

import { useEffect, type MouseEvent } from "react";

const TARGET_ID = "main-content";

/**
 * "Skip to main content", the first tab stop on every page (WCAG 2.4.1).
 *
 * Pages each render their own <main>, so the link finds it at click time
 * instead of needing an id on every page. Hidden until it has focus.
 */
export function SkipLink() {
  // Without JavaScript the link still works as a plain #main-content anchor.
  useEffect(() => {
    const main = document.querySelector("main");
    if (main && !main.id) main.id = TARGET_ID;
  });

  function skip(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.querySelector<HTMLElement>("main");
    if (!main) return;
    event.preventDefault();
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus();
    main.scrollIntoView({ block: "start" });
  }

  return (
    <a
      href={`#${TARGET_ID}`}
      onClick={skip}
      className="sr-only rounded-md bg-white px-4 py-2 text-sm font-semibold text-[var(--maroon)] shadow-lg ring-2 ring-[var(--maroon)] focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100]"
    >
      Skip to main content
    </a>
  );
}
