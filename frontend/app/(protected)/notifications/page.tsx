import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import {
  getMyNotification,
  listMyNotifications,
  NotificationCenter,
  notificationSentence,
} from "@/modules/notifications";

export const metadata: Metadata = {
  title: "Notifications · CampusConnect",
};

type NotificationsPageProps = {
  searchParams: Promise<{ removed?: string }>;
};

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  await requireUser();
  const { removed } = await searchParams;

  const [items, removedNotice] = await Promise.all([
    listMyNotifications(),
    typeof removed === "string" ? getMyNotification(removed) : null,
  ]);

  return (
    <main className="flex-1 bg-gray-100 px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>

        {removedNotice?.type === "content_removed" ? (
          <div role="status" className="rounded-lg border border-[var(--maroon-200)] bg-[var(--maroon-50)] p-4 text-gray-900">
            <p className="font-semibold">{notificationSentence(removedNotice)}.</p>
            <p className="mt-1 text-sm text-gray-700">
              It is no longer visible to other students, so there is nothing to open. If you think
              this was a mistake, contact a moderator.
            </p>
          </div>
        ) : null}

        <NotificationCenter initialItems={items} />
      </div>
    </main>
  );
}
