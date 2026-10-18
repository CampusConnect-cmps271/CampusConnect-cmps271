/**
 * Public API of the messaging module. Import from "@/modules/messaging", never
 * from a file inside it.
 *
 * Note: this barrel re-exports server-only code, so a Client Component must
 * not import it. Client Components inside the module import their siblings
 * directly.
 */

export {
  loadEarlierMessages,
  markConversationRead,
  sendMessage,
  startConversation,
  type EarlierMessagesResult,
  type SendMessageResult,
  type StartConversationState,
} from "./actions";

export {
  countMyUnreadConversations,
  getConversation,
  listMyConversations,
} from "./queries";

export { MESSAGES_READ_EVENT } from "./events";
export { formatMessageTime, formatRelativeTime, messagePreview, PREVIEW_LENGTH } from "./format";
export { mergeMessages, toMessage } from "./messages";

export {
  conversationIdSchema,
  earlierCursorSchema,
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  messageBodySchema,
  messageTimeSchema,
  studentIdSchema,
} from "./schema";

export type { ConversationSummary, ConversationThread, Message } from "./types";

export { ConversationView } from "./components/ConversationView";
export { InboxList } from "./components/InboxList";
export { InboxLiveRefresh } from "./components/InboxLiveRefresh";
export { MessageButton } from "./components/MessageButton";
export { UnreadMessagesBadge } from "./components/UnreadMessagesBadge";
