import "server-only";
import { cache } from "react";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { getProfile } from "@/modules/profiles";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_COLUMNS, toMessage, type MessageRow } from "./messages";
import { conversationIdSchema, MESSAGE_PAGE_SIZE } from "./schema";
import type { ConversationSummary, ConversationThread, Message } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ConversationRow = { id: string; student_a: string; student_b: string };

type InboxRow = {
  conversation_id: string;
  other_user_id: string;
  other_user_name: string;
  last_message_preview: string;
  last_message_at: string;
  unread: boolean;
};

/** Where a page of older messages starts: just before this message. */
export type MessageCursor = { createdAt: string; id: string };

/**
 * Up to MESSAGE_PAGE_SIZE messages of a conversation, oldest to newest: the
 * latest ones, or the ones just before `before`. RLS returns nothing for a
 * conversation the caller is not in. Callers validate `before`, which is
 * written into the filter.
 */
export async function readMessagePage(
  supabase: SupabaseServerClient,
  conversationId: string,
  before?: MessageCursor,
): Promise<{ messages: Message[]; hasEarlier: boolean }> {
  let query = supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId);

  if (before) {
    // Messages sent in the same instant are ordered by id, so the page
    // boundary never skips or repeats one.
    query = query.or(
      `created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`,
    );
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1);

  if (error) {
    throw Object.assign(new Error("Failed to load messages."), { code: error.code });
  }

  const rows = (data ?? []) as MessageRow[];
  const messages = rows
    .slice(0, MESSAGE_PAGE_SIZE)
    .map(toMessage)
    .filter((message): message is Message => message !== null)
    .reverse();

  return { messages, hasEarlier: rows.length > MESSAGE_PAGE_SIZE };
}

/**
 * A conversation of the signed-in student's, with its latest messages, or
 * null when the id is malformed, unknown, or someone else's (RLS hides it).
 * Memoised per request, so a page and its metadata share one lookup.
 */
export const getConversation = cache(
  async (id: string): Promise<ConversationThread | null> => {
    if (!conversationIdSchema.safeParse(id).success) return null;

    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("conversations")
      .select("id, student_a, student_b")
      .eq("id", id)
      .maybeSingle<ConversationRow>();

    if (error) {
      log.error(
        "messaging.conversation.read_failure",
        { conversationId: id, code: error.code ?? null },
        { userId: user.id },
      );
      throw new Error("Failed to load the conversation.");
    }

    if (!data) return null;

    const otherId = data.student_a === user.id ? data.student_b : data.student_a;

    const [other, page, readState] = await Promise.all([
      getProfile(otherId),
      readMessagePage(supabase, id).catch((cause: { code?: string }) => {
        log.error(
          "messaging.messages.read_failure",
          { conversationId: id, code: cause.code ?? null },
          { userId: user.id },
        );
        throw new Error("Failed to load messages.");
      }),
      supabase
        .from("conversation_reads")
        .select("last_read_at")
        .eq("conversation_id", id)
        .eq("user_id", user.id)
        .maybeSingle<{ last_read_at: string }>(),
    ]);

    return {
      id: data.id,
      otherStudent: { id: otherId, name: other?.fullName ?? "CampusConnect student" },
      messages: page.messages,
      hasEarlier: page.hasEarlier,
      lastReadAt: readState.data?.last_read_at ?? null,
    };
  },
);

/** The signed-in student's conversations that have messages, newest first. */
export async function listMyConversations(): Promise<ConversationSummary[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("list_my_conversations");

  if (error) {
    log.error(
      "messaging.inbox.read_failure",
      { code: error.code ?? null },
      { userId: user.id },
    );
    throw new Error("Failed to load your messages.");
  }

  return ((data ?? []) as InboxRow[]).map((row) => ({
    id: row.conversation_id,
    otherStudent: { id: row.other_user_id, name: row.other_user_name },
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unread: row.unread,
  }));
}

/**
 * How many conversations hold a message the signed-in student has not read,
 * or null when it cannot be read. Never throws: the header must render even
 * when messaging is down.
 */
export async function countMyUnreadConversations(): Promise<number | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("count_my_unread_conversations");

  if (error || typeof data !== "number") {
    log.error(
      "messaging.unread_count.read_failure",
      { code: error?.code ?? "no_count" },
      { userId: user.id },
    );
    return null;
  }

  return data;
}
