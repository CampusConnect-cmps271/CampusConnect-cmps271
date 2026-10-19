import type { Message } from "./types";

/** A messages row as PostgREST and Realtime send it. */
export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export const MESSAGE_COLUMNS = "id, conversation_id, sender_id, body, created_at";

/**
 * The app's shape for a messages row, or null when the value is not one. Rows
 * from Realtime arrive as plain JSON, so every field is checked.
 */
export function toMessage(row: unknown): Message | null {
  if (typeof row !== "object" || row === null) return null;

  const { id, conversation_id, sender_id, body, created_at } = row as Record<
    string,
    unknown
  >;

  if (
    typeof id !== "string" ||
    typeof conversation_id !== "string" ||
    typeof sender_id !== "string" ||
    typeof body !== "string" ||
    typeof created_at !== "string"
  ) {
    return null;
  }

  return {
    id,
    conversationId: conversation_id,
    senderId: sender_id,
    body,
    createdAt: created_at,
  };
}

/** Oldest first; messages sent at the same instant fall back to id order. */
function compareMessages(a: Message, b: Message): number {
  const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Adds messages to a thread. The same message can arrive more than once (the
 * send result, Realtime and a page refresh all carry it), so it is kept once,
 * and the thread stays oldest to newest whatever order they arrive in.
 * Returns the same array when nothing new was added.
 */
export function mergeMessages(
  current: readonly Message[],
  incoming: readonly Message[],
): Message[] {
  const known = new Set(current.map((message) => message.id));
  const added: Message[] = [];

  for (const message of incoming) {
    if (known.has(message.id)) continue;
    known.add(message.id);
    added.push(message);
  }

  if (added.length === 0) return current as Message[];

  return [...current, ...added].sort(compareMessages);
}
