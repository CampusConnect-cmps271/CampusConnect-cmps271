"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinksProps = {
  /** Rendered after "Messages"; comes from the messaging module. */
  messagesBadge: ReactNode;
  /** The log-out control; comes from the auth module. */
  logout: ReactNode;
};

const LINK_CLASS =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

/**
 * The header's links, marking the current section. A Client Component
 * because the layout that renders the header does not re-render on
 * navigation, so only the client knows the current path.
 */
export function NavLinks({ messagesBadge, logout }: NavLinksProps) {
  const pathname = usePathname();
  const inSkillSwap = pathname === "/skillswap" || pathname.startsWith("/skillswap/");
  const inMessages = pathname === "/messages" || pathname.startsWith("/messages/");
  const inProfile = pathname === "/profile";

  return (
    <ul className="flex flex-wrap items-center gap-1">
      <li>
        <Link
          href="/skillswap"
          aria-current={inSkillSwap ? "page" : undefined}
          className={`${LINK_CLASS} ${inSkillSwap ? "text-[var(--maroon)]" : "text-[var(--ink-soft)]"}`}
        >
          SkillSwap
        </Link>
      </li>
      <li>
        <Link
          href="/messages"
          aria-current={inMessages ? "page" : undefined}
          className={`${LINK_CLASS} ${inMessages ? "text-[var(--maroon)]" : "text-[var(--ink-soft)]"}`}
        >
          Messages
          {messagesBadge}
        </Link>
      </li>
      <li>
        <Link
          href="/profile"
          aria-current={inProfile ? "page" : undefined}
          className={`${LINK_CLASS} ${inProfile ? "text-[var(--maroon)]" : "text-[var(--ink-soft)]"}`}
        >
          Profile
        </Link>
      </li>
      <li>{logout}</li>
    </ul>
  );
}
