"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinksProps = {
  /** Rendered after "Messages"; comes from the messaging module. */
  messagesBadge: ReactNode;
  /** The notification bell; comes from the notifications module. */
  notifications: ReactNode;
  /** The log-out control; comes from the auth module. */
  logout: ReactNode;
};

const LINK_CLASS =
  "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

const DRAWER_ID = "main-menu";

/**
 * The header's menu: a button that opens a side bar with the links, marking
 * the current section. A Client Component because the layout that renders
 * the header does not re-render on navigation, so only the client knows the
 * current path.
 */
export function NavLinks({ messagesBadge, notifications, logout }: NavLinksProps) {
  const pathname = usePathname();
  // The side bar counts as open only on the page it was opened on, so
  // navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const button = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      button.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const inCourses = pathname === "/courses" || pathname.startsWith("/courses/");
  const inPlanner = pathname === "/planner" || pathname.startsWith("/planner/");
  const inElectives = pathname === "/electives" || pathname.startsWith("/electives/");
  const inSkillSwap = pathname === "/skillswap" || pathname.startsWith("/skillswap/");
  const inAssistant = pathname === "/assistant";
  const inMessages = pathname === "/messages" || pathname.startsWith("/messages/");
  const inProfile = pathname === "/profile";

  const item = (href: string, current: boolean, label: ReactNode, ref?: typeof firstLink) => (
    <li>
      <Link
        ref={ref}
        href={href}
        aria-current={current ? "page" : undefined}
        onClick={() => setOpenOn(null)}
        className={`${LINK_CLASS} ${current ? "bg-[var(--maroon-50)] text-[var(--maroon)]" : "text-[var(--ink-soft)]"}`}
      >
        {label}
      </Link>
    </li>
  );

  return (
    <div className="flex items-center gap-1">
      {notifications}
      <button
        ref={button}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={DRAWER_ID}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--ink)] hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      <div
        aria-hidden="true"
        onClick={() => setOpenOn(null)}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        id={DRAWER_ID}
        aria-label="Menu"
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-2 border-l border-[var(--border)] bg-white p-3 shadow-xl transition-transform duration-200 ${open ? "translate-x-0" : "invisible translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-sm font-semibold text-[var(--ink)]">Menu</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => {
              setOpenOn(null);
              button.current?.focus();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        <ul className="flex flex-col gap-0.5">
          {item("/courses", inCourses, "Browse courses", firstLink)}
          {item("/planner", inPlanner, "Plan your semester")}
          {item("/electives/preferences", inElectives, "Elective preferences")}
          {item("/skillswap", inSkillSwap, "SkillSwap")}
          {item("/assistant", inAssistant, "Assistant")}
          {item("/messages", inMessages, <>Messages{messagesBadge}</>)}
          {item("/profile", inProfile, "Profile")}
        </ul>
        <div className="mt-auto border-t border-[var(--border)] pt-2">{logout}</div>
      </aside>
    </div>
  );
}
