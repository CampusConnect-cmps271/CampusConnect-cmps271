import Link from "next/link";
import { LogoutButton } from "@/modules/auth";
import { countMyUnreadConversations, UnreadMessagesBadge } from "@/modules/messaging";
import { NavLinks } from "./NavLinks";

/**
 * The header on every signed-in page: the wordmark (to the feed), Messages
 * with the unread count, Profile and Log out.
 */
export async function AppHeader() {
  const unread = await countMyUnreadConversations();

  return (
    <header className="border-b border-[var(--border)] bg-white text-[var(--ink)]">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
      >
        <Link
          href="/home"
          className="rounded-md text-base font-bold tracking-tight text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
        >
          CampusConnect
        </Link>

        <NavLinks
          messagesBadge={<UnreadMessagesBadge initialCount={unread} />}
          logout={
            <LogoutButton className="rounded-md px-2 py-1.5 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--maroon-50)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60" />
          }
        />
      </nav>
    </header>
  );
}
