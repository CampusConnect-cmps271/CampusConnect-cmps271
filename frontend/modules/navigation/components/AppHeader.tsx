import Link from "next/link";
import { LogoutButton, requireUser } from "@/modules/auth";
import { countMyUnreadConversations, UnreadMessagesBadge } from "@/modules/messaging";
import { countMyUnreadNotifications, NotificationBell } from "@/modules/notifications";
import { NavLinks } from "./NavLinks";

/**
 * The header on every signed-in page: the wordmark (to the feed),
 * SkillSwap, Messages with the unread count, the notification bell,
 * Profile and Log out.
 */
export async function AppHeader() {
  const user = await requireUser();
  const [unread, unreadNotifications] = await Promise.all([
    countMyUnreadConversations(),
    countMyUnreadNotifications(),
  ]);

  return (
    <header className="border-b border-[var(--border)] bg-white text-[var(--ink)]">
      <nav
        aria-label="Main"
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-8 lg:px-12"
      >
        <Link
          href="/home"
          className="inline-flex items-center gap-2 rounded-md text-base font-bold tracking-tight text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-[10px] bg-[var(--maroon)] text-lg text-white"
          >
            C
          </span>
          CampusConnect
        </Link>

        <NavLinks
          messagesBadge={<UnreadMessagesBadge initialCount={unread} />}
          notifications={
            <NotificationBell userId={user.id} initialCount={unreadNotifications} />
          }
          logout={
            <LogoutButton className="rounded-md px-2 py-1.5 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--maroon-50)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60" />
          }
        />
      </nav>
    </header>
  );
}
