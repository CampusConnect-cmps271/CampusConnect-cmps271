/** One saved message, as the app shows it. */
export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

/** One row of the inbox. */
export type ConversationSummary = {
  id: string;
  otherStudent: { id: string; name: string };
  lastMessagePreview: string;
  lastMessageAt: string;
  unread: boolean;
};

/** An open conversation: who it is with and its latest messages. */
export type ConversationThread = {
  id: string;
  otherStudent: { id: string; name: string };
  /** Oldest to newest. */
  messages: Message[];
  /** Whether older messages exist than the first one in `messages`. */
  hasEarlier: boolean;
  /** When the signed-in student last read this conversation. */
  lastReadAt: string | null;
};
