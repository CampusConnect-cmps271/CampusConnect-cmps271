import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import { InboxList, InboxLiveRefresh, listMyConversations } from "@/modules/messaging";

export const metadata: Metadata = {
  title: "Messages · CampusConnect",
};

export default async function MessagesPage() {
  await requireUser();
  const conversations = await listMyConversations();

  return (
    <main className="flex-1 bg-gray-100 px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <InboxList conversations={conversations} now={new Date()} />
        <InboxLiveRefresh />
      </div>
    </main>
  );
}
