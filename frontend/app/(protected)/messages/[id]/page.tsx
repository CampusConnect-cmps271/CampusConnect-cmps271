import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import { ConversationView, getConversation } from "@/modules/messaging";

type ConversationPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: ConversationPageProps): Promise<Metadata> {
  // Metadata can resolve before the layout's check; a signed-out visitor
  // must reach login, not a failed lookup.
  await requireUser();
  const { id } = await params;
  const conversation = await getConversation(id);

  return {
    title: conversation
      ? `${conversation.otherStudent.name} · Messages · CampusConnect`
      : "Messages · CampusConnect",
  };
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const user = await requireUser();
  const { id } = await params;

  // Unknown ids and other students' conversations look the same: not found.
  const conversation = await getConversation(id);
  if (!conversation) notFound();

  const { otherStudent } = conversation;

  return (
    <AppShell>
    <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
      <div className="flex w-full flex-col gap-4">
        <Link href="/messages" className="text-sm font-medium text-[var(--maroon)] hover:underline">
          ← All messages
        </Link>

        <section
          aria-labelledby="conversation-heading"
          className="overflow-hidden rounded-lg border border-[var(--border)] bg-white text-[var(--ink)] shadow-sm"
        >
          <header className="border-b border-[var(--border)] px-4 py-3">
            <h1 id="conversation-heading" className="break-words text-lg font-semibold">
              <Link
                href={`/profile/${otherStudent.id}`}
                className="hover:underline focus-visible:underline"
              >
                {otherStudent.name}
              </Link>
            </h1>
          </header>

          <ConversationView
            key={conversation.id}
            conversationId={conversation.id}
            currentUserId={user.id}
            otherStudentName={otherStudent.name}
            initialMessages={conversation.messages}
            initialHasEarlier={conversation.hasEarlier}
            lastReadAt={conversation.lastReadAt}
          />
        </section>
      </div>
    </main>
    </AppShell>
  );
}
