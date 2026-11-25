import Link from "next/link";
import { LogoutButton, requireUser } from "@/modules/auth";
import { UnreadMessagesBadge } from "@/modules/messaging";
import { NotificationBell } from "@/modules/notifications";
import { getHeaderCounts } from "../counts";
import { NavLinks } from "./NavLinks";

/**
 * The header on every signed-in page: the wordmark (to the feed),
 * SkillSwap, Messages with the unread count, the notification bell,
 * Profile and Log out.
 */
export async function AppHeader() {
  const user = await requireUser();
  const { messages: unread, notifications: unreadNotifications } = await getHeaderCounts();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] text-[var(--ink)]">
      {/* The frosted background is its own layer: a backdrop-filter on the
          header itself would make the header the containing block for the
          fixed side bar inside it, shrinking the side bar to the header. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75"
      />
      <nav
        aria-label="Main"
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2.5 sm:px-8 lg:px-12"
      >
        <Link
          href="/home"
          className="group inline-flex items-center gap-2.5 rounded-xl font-[family-name:var(--font-heading)] text-base font-bold tracking-tight text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
        >
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--maroon)] to-[var(--maroon-dark)] text-lg text-white shadow-sm transition-transform duration-200 group-hover:scale-105"
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
            <LogoutButton className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-center text-sm font-semibold text-[var(--maroon)] transition-colors duration-150 hover:border-[var(--maroon-200)] hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60" />
          }
        />
      </nav>
    </header>
  );
}
