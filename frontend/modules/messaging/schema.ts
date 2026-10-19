import * as z from "zod";

/**
 * Longest message, in characters, matching messages_body_length in the
 * messaging migration (20261018160000_create_messaging.sql).
 */
export const MESSAGE_MAX_LENGTH = 2000;

/** How many messages a conversation shows at first, and per "Load earlier". */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * A message as typed: trimmed, then 1-2000 characters. Shared by the send box,
 * which checks before sending, and the server action, which checks again
 * because anyone can POST to it.
 */
export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(
    MESSAGE_MAX_LENGTH,
    `Messages can be up to ${MESSAGE_MAX_LENGTH} characters.`,
  );

/** Conversations and students are named by UUIDs. */
export const conversationIdSchema = z.uuid();
export const studentIdSchema = z.uuid();

/** A message time from the database, e.g. 2026-10-18T09:15:02.123456+00:00. */
export const messageTimeSchema = z.iso.datetime({ offset: true });

/** Where "Load earlier" continues from: the oldest message on screen. */
export const earlierCursorSchema = z.object({
  createdAt: messageTimeSchema,
  id: z.uuid(),
});
