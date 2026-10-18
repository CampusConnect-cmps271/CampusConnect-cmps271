import Link from "next/link";
import { formatRelativeTime, messagePreview } from "../format";
import type { ConversationSummary } from "../types";

type InboxListProps = {
  conversations: ConversationSummary[];
  /** When the page was rendered; relative times count from here. */
  now: Date;
};

/** The inbox: one row per conversation, newest first. */
export function InboxList({ conversations, now }: InboxListProps) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 text-center text-gray-700 shadow-md">
        <p className="font-medium text-gray-900">No conversations yet.</p>
        <p className="mt-2 text-sm">
          Open a student&apos;s profile, for example from a post&apos;s author name, and choose{" "}
          <strong>Message</strong> to start one.
        </p>
        <Link
          href="/home"
          className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline"
        >
          Browse the feed
        </Link>
      </div>
    );
  }

  return (
    <ul aria-label="Conversations" className="divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow-md">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`/messages/${conversation.id}`}
            className="flex items-start gap-3 px-4 py-3 text-gray-900 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--maroon)]"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2.5 shrink-0 rounded-full ${conversation.unread ? "bg-[var(--maroon)]" : "bg-transparent"}`}
            />

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline justify-between gap-3">
                <span
                  className={`truncate ${conversation.unread ? "font-semibold" : "font-medium"}`}
                >
                  {conversation.otherStudent.name}
                </span>
                <time
                  dateTime={conversation.lastMessageAt}
                  className="shrink-0 text-xs text-gray-500"
                >
                  {formatRelativeTime(conversation.lastMessageAt, now)}
                </time>
              </span>

              <span
                className={`truncate text-sm ${conversation.unread ? "text-gray-900" : "text-gray-600"}`}
              >
                {conversation.unread ? <span className="sr-only">Unread: </span> : null}
                {messagePreview(conversation.lastMessagePreview)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
