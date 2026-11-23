"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  MessageCircle,
  Repeat2,
  Sparkles,
  Target,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";

type NavLinksProps = {
  /** Rendered after "Messages"; comes from the messaging module. */
  messagesBadge: ReactNode;
  /** The notification bell; comes from the notifications module. */
  notifications: ReactNode;
  /** The log-out control; comes from the auth module. */
  logout: ReactNode;
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

const LINK_CLASS = `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 hover:bg-[var(--maroon-50)] ${FOCUS}`;

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
  const inCommunities = pathname === "/communities" || pathname.startsWith("/communities/");
  const inElectives = pathname === "/electives" || pathname.startsWith("/electives/");
  const inSkillSwap = pathname === "/skillswap" || pathname.startsWith("/skillswap/");
  const inAssistant = pathname === "/assistant";
  const inMessages = pathname === "/messages" || pathname.startsWith("/messages/");
  const inProfile = pathname === "/profile";

  const item = (
    href: string,
    current: boolean,
    Icon: LucideIcon,
    label: ReactNode,
    ref?: typeof firstLink,
  ) => (
    <li>
      <Link
        ref={ref}
        href={href}
        aria-current={current ? "page" : undefined}
        onClick={() => setOpenOn(null)}
        className={`${LINK_CLASS} ${current ? "bg-[var(--maroon-50)] font-semibold text-[var(--maroon)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
      >
        {current ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 left-0 w-1 rounded-full bg-[var(--maroon)]"
          />
        ) : null}
        <span
          aria-hidden="true"
          className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors duration-150 ${current ? "bg-[var(--maroon)] text-white" : "bg-[var(--maroon-50)] text-[var(--maroon)] group-hover:bg-[var(--maroon-100)]"}`}
        >
          <Icon size={16} strokeWidth={2} />
        </span>
        <span className="flex items-center gap-2">{label}</span>
      </Link>
    </li>
  );

  return (
    <div className="flex items-center gap-1.5">
      {notifications}
      <button
        ref={button}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={DRAWER_ID}
        onClick={() => setOpenOn(open ? null : pathname)}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--ink)] shadow-sm transition-colors duration-150 hover:border-[var(--maroon-200)] hover:bg-[var(--maroon-50)] hover:text-[var(--maroon)] ${FOCUS}`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      <div
        aria-hidden="true"
        onClick={() => setOpenOn(null)}
        className={`fixed inset-0 z-40 bg-[var(--maroon-deep)]/40 backdrop-blur-[2px] transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        id={DRAWER_ID}
        aria-label="Menu"
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-80 max-w-[88vw] flex-col gap-3 rounded-l-3xl border-l border-[var(--border)] bg-white p-4 shadow-[var(--shadow-md)] transition-transform duration-300 ease-out ${open ? "translate-x-0" : "invisible translate-x-full"}`}
      >
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-[var(--maroon)] to-[var(--maroon-dark)] px-4 py-3 text-white">
          <span className="font-[family-name:var(--font-heading)] text-sm font-semibold tracking-wide">
            Menu
          </span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => {
              setOpenOn(null);
              button.current?.focus();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 transition-colors duration-150 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {item("/courses", inCourses, BookOpen, "Browse courses", firstLink)}
          {item("/planner", inPlanner, CalendarDays, "Plan your semester")}
          {item("/communities", inCommunities, UsersRound, "Communities")}
          {item("/electives/preferences", inElectives, Target, "Elective preferences")}
          {item("/skillswap", inSkillSwap, Repeat2, "SkillSwap")}
          {item("/assistant", inAssistant, Sparkles, "Assistant")}
          {item("/messages", inMessages, MessageCircle, <>Messages{messagesBadge}</>)}
          {item("/profile", inProfile, UserRound, "Profile")}
        </ul>
        <div className="mt-auto border-t border-[var(--border)] pt-3">{logout}</div>
      </aside>
    </div>
  );
}
