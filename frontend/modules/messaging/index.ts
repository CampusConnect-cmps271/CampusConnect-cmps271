/**
 * Public API of the messaging module. Import from "@/modules/messaging", never
 * from a file inside it.
 *
 * Note: this barrel re-exports server-only code, so a Client Component must
 * not import it. Client Components inside the module import their siblings
 * directly.
 */

export { startConversation, type StartConversationState } from "./actions";

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

export { MessageButton } from "./components/MessageButton";
