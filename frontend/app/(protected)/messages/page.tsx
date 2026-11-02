import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import { InboxList, InboxLiveRefresh, listMyConversations } from "@/modules/messaging";

export const metadata: Metadata = {
  title: "Messages · CampusConnect",
};

export default async function MessagesPage() {
  await requireUser();
  const conversations = await listMyConversations();

  return (
    <AppShell>
      <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
        <div className="flex w-full flex-col gap-4">
          <h1 className="text-2xl font-bold text-[var(--ink)]">Messages</h1>
          <InboxList conversations={conversations} now={new Date()} />
          <InboxLiveRefresh />
        </div>
      </main>
    </AppShell>
  );
}
