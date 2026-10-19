"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_COLUMNS, toMessage, type MessageRow } from "./messages";
import { readMessagePage } from "./queries";
import {
  conversationIdSchema,
  earlierCursorSchema,
  messageBodySchema,
  messageTimeSchema,
  studentIdSchema,
} from "./schema";
import type { Message } from "./types";

export type StartConversationState = { error: string } | null;
export type SendMessageResult = { message: Message } | { error: string };
export type EarlierMessagesResult =
  | { messages: Message[]; hasEarlier: boolean }
  | { error: string };

const CANNOT_MESSAGE = "You can't message this student.";
const START_FAILED = "We couldn't open the conversation. Please try again.";
const CANNOT_SEND = "You can't send messages in this conversation.";
const SEND_FAILED = "Your message wasn't sent. Please try again.";
const LOAD_FAILED = "We couldn't load earlier messages. Please try again.";

/**
 * Opens the conversation with another student, creating it the first time,
 * and goes to it. MessageButton binds the student's id; the form's state and
 * data are not needed.
 */
export async function startConversation(
  otherStudentId: string,
): Promise<StartConversationState> {
  const user = await requireUser();
  const parsed = studentIdSchema.safeParse(otherStudentId);

  if (!parsed.success || parsed.data === user.id) return { error: CANNOT_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", {
    other_user: parsed.data,
  });

  // 22023: yourself; P0002: no such student. Both are the caller's mistake.
  if (error?.code === "22023" || error?.code === "P0002") {
    log.warn(
      "messaging.conversation.rejected",
      { otherStudentId: parsed.data, code: error.code },
      { userId: user.id },
    );
    return { error: CANNOT_MESSAGE };
  }

  if (error || typeof data !== "string") {
    log.error(
      "messaging.conversation.failure",
      { otherStudentId: parsed.data, code: error?.code ?? "no_id" },
      { userId: user.id },
    );
    return { error: START_FAILED };
  }

  log.info(
    "messaging.conversation.started",
    { conversationId: data, otherStudentId: parsed.data },
    { userId: user.id },
  );

  redirect(`/messages/${data}`);
}

/**
 * Sends a message as the signed-in student and returns the saved row, which
 * replaces the copy the send box showed straight away. RLS refuses a
 * conversation the sender is not in.
 */
export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<SendMessageResult> {
  const user = await requireUser();
  const id = conversationIdSchema.safeParse(conversationId);
  if (!id.success) return { error: CANNOT_SEND };

  const parsed = messageBodySchema.safeParse(body);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? SEND_FAILED };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: id.data, sender_id: user.id, body: parsed.data })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();

  if (error?.code === "42501") {
    log.warn(
      "messaging.message.rejected",
      { conversationId: id.data, code: error.code },
      { userId: user.id },
    );
    return { error: CANNOT_SEND };
  }

  const message = error ? null : toMessage(data);

  if (!message) {
    log.error(
      "messaging.message.failure",
      { conversationId: id.data, code: error?.code ?? "no_row" },
      { userId: user.id },
    );
    return { error: SEND_FAILED };
  }

  log.info(
    "messaging.message.sent",
    { conversationId: id.data, messageId: message.id },
    { userId: user.id },
  );

  return { message };
}

/** The page of messages before the oldest one on screen, for "Load earlier". */
export async function loadEarlierMessages(
  conversationId: string,
  before: { createdAt: string; id: string },
): Promise<EarlierMessagesResult> {
  const user = await requireUser();
  const id = conversationIdSchema.safeParse(conversationId);
  const cursor = earlierCursorSchema.safeParse(before);

  if (!id.success || !cursor.success) return { error: LOAD_FAILED };

  const supabase = await createClient();

  try {
    return await readMessagePage(supabase, id.data, cursor.data);
  } catch (cause) {
    log.error(
      "messaging.messages.read_failure",
      { conversationId: id.data, code: (cause as { code?: string }).code ?? null },
      { userId: user.id },
    );
    return { error: LOAD_FAILED };
  }
}

/**
 * Marks the conversation read up to `readUpTo`, the time of the newest
 * message the student has seen. Never moves the read marker backwards, so a
 * stale tab cannot make a conversation unread again.
 */
export async function markConversationRead(
  conversationId: string,
  readUpTo: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const id = conversationIdSchema.safeParse(conversationId);
  const time = messageTimeSchema.safeParse(readUpTo);

  if (!id.success || !time.success) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversation_reads")
    .update({ last_read_at: time.data })
    .eq("conversation_id", id.data)
    .eq("user_id", user.id)
    .lt("last_read_at", time.data);

  if (error) {
    log.error(
      "messaging.read_state.failure",
      { conversationId: id.data, code: error.code ?? null },
      { userId: user.id },
    );
    return { ok: false };
  }

  return { ok: true };
}
