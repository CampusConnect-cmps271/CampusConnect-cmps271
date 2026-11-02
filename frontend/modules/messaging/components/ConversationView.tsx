"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadEarlierMessages, markConversationRead, sendMessage } from "../actions";
import { MESSAGES_READ_EVENT } from "../events";
import { formatMessageTime } from "../format";
import { mergeMessages, toMessage } from "../messages";
import { MESSAGE_MAX_LENGTH, messageBodySchema } from "../schema";
import type { Message } from "../types";

type ConversationViewProps = {
  conversationId: string;
  currentUserId: string;
  otherStudentName: string;
  /** The latest messages, oldest to newest. */
  initialMessages: Message[];
  initialHasEarlier: boolean;
  lastReadAt: string | null;
};

/** A message shown before the server has saved it. */
type PendingMessage = { key: string; body: string };

const SEND_FAILED = "Your message wasn't sent. Please try again.";
const LOAD_FAILED = "We couldn't load earlier messages. Please try again.";

/** How close to the bottom still counts as "following" the conversation. */
const FOLLOW_THRESHOLD_PX = 80;

/**
 * An open conversation: its messages, live updates through Realtime, and the
 * send box. Message text is rendered as plain text only.
 */
export function ConversationView({
  conversationId,
  currentUserId,
  otherStudentName,
  initialMessages,
  initialHasEarlier,
  lastReadAt,
}: ConversationViewProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [hasEarlier, setHasEarlier] = useState(initialHasEarlier);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState("");

  // A refresh re-renders the page with the latest messages from the server.
  // Fold them in rather than replacing what is on screen.
  const [serverMessages, setServerMessages] = useState(initialMessages);
  if (serverMessages !== initialMessages) {
    setServerMessages(initialMessages);
    setMessages((current) => mergeMessages(current, initialMessages));
  }

  // Live messages. Postgres Changes checks the messages RLS policy for each
  // subscriber, so only the two participants receive a row.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // A fresh topic per mount: the client reuses a channel with the same
    // name, and the previous one may still be closing.
    const channel = supabase
      .channel(`conversation:${conversationId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = toMessage(payload.new);
          if (message?.conversationId !== conversationId) return;
          setMessages((current) => mergeMessages(current, [message]));
        },
      );

    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((status) => {
        // Catch up on anything sent before the channel was (re)connected.
        if (status === "SUBSCRIBED" && !cancelled) router.refresh();
      });
    });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  // Opening the thread marks it read, and so does a new message from the
  // other student while the thread is open and the tab is visible.
  const newestFromOther = messages.findLast(
    (message) => message.senderId !== currentUserId,
  );
  const markedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!newestFromOther) return;
    const { id, createdAt } = newestFromOther;

    const alreadyRead =
      lastReadAt !== null &&
      (lastReadAt === createdAt || Date.parse(createdAt) < Date.parse(lastReadAt));
    if (alreadyRead) markedRef.current = id;

    function markRead() {
      if (markedRef.current === id || document.visibilityState !== "visible") return;
      markedRef.current = id;

      void markConversationRead(conversationId, createdAt).then(
        (result) => {
          if (result.ok) window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
        },
        () => {
          // Leave it unread; the next message or visit tries again.
          markedRef.current = null;
        },
      );
    }

    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [conversationId, lastReadAt, newestFromOther]);

  // Scrolling: start at the newest message, follow new ones while the reader
  // is at the bottom, and keep the view still when earlier ones are added.
  const listRef = useRef<HTMLOListElement>(null);
  const followRef = useRef(true);
  const prependRef = useRef<{ height: number; top: number } | null>(null);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    followRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_THRESHOLD_PX;
  }

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    if (prependRef.current) {
      list.scrollTop = list.scrollHeight - prependRef.current.height + prependRef.current.top;
      prependRef.current = null;
    } else if (followRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, pending]);

  async function loadEarlier() {
    const oldest = messages[0];
    if (!oldest || loadingEarlier) return;

    setLoadingEarlier(true);
    setEarlierError("");

    try {
      const result = await loadEarlierMessages(conversationId, {
        createdAt: oldest.createdAt,
        id: oldest.id,
      });

      if ("error" in result) {
        setEarlierError(result.error);
        return;
      }

      const list = listRef.current;
      if (list && result.messages.length > 0) {
        prependRef.current = { height: list.scrollHeight, top: list.scrollTop };
      }
      setMessages((current) => mergeMessages(current, result.messages));
      setHasEarlier(result.hasEarlier);
    } catch {
      setEarlierError(LOAD_FAILED);
    } finally {
      setLoadingEarlier(false);
    }
  }

  const trimmedLength = draft.trim().length;
  const tooLong = trimmedLength > MESSAGE_MAX_LENGTH;
  const canSend = !sending && trimmedLength > 0 && !tooLong;

  async function send() {
    if (sending) return;

    const typed = draft;
    const parsed = messageBodySchema.safeParse(typed);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? SEND_FAILED);
      return;
    }

    const key = crypto.randomUUID();
    setError("");
    setSending(true);
    followRef.current = true;
    setPending((current) => [...current, { key, body: parsed.data }]);
    setDraft("");

    // Put the text back if it failed, unless something new was typed.
    const restoreDraft = () => setDraft((current) => (current === "" ? typed : current));

    try {
      const result = await sendMessage(conversationId, parsed.data);

      if ("error" in result) {
        setError(result.error);
        restoreDraft();
      } else {
        setMessages((current) => mergeMessages(current, [result.message]));
      }
    } catch {
      setError(SEND_FAILED);
      restoreDraft();
    } finally {
      setPending((current) => current.filter((message) => message.key !== key));
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) void send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter (and Enter while composing text) adds a line.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) void send();
  }

  return (
    <div className="flex flex-col">
      {hasEarlier ? (
        <div className="flex flex-col items-center gap-1 border-b border-[var(--border)] px-4 py-2">
          <button
            type="button"
            onClick={loadEarlier}
            disabled={loadingEarlier}
            className="rounded-md px-3 py-1 text-sm font-medium text-[var(--maroon)] hover:bg-[var(--maroon-50)] disabled:opacity-60"
          >
            {loadingEarlier ? "Loading…" : "Load earlier"}
          </button>
          {earlierError ? (
            <p role="alert" className="text-xs text-[var(--danger)]">
              {earlierError}
            </p>
          ) : null}
        </div>
      ) : null}

      <ol
        ref={listRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label={`Messages with ${otherStudentName}`}
        tabIndex={0}
        className="flex h-[60vh] min-h-64 flex-col gap-3 overflow-y-auto px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--maroon)]"
      >
        {messages.length === 0 && pending.length === 0 ? (
          <li className="m-auto text-sm text-[var(--ink-soft)]">
            No messages yet. Say hello to {otherStudentName}!
          </li>
        ) : null}

        {messages.map((message) => (
          <MessageItem
            key={message.id}
            mine={message.senderId === currentUserId}
            senderName={otherStudentName}
            body={message.body}
            footer={
              <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
            }
          />
        ))}

        {pending.map((message) => (
          <MessageItem
            key={message.key}
            mine
            pending
            senderName={otherStudentName}
            body={message.body}
            footer="Sending…"
          />
        ))}
      </ol>

      <form
        onSubmit={handleSubmit}
        aria-label="Send a message"
        className="flex flex-col gap-2 border-t border-[var(--border)] p-3 sm:p-4"
      >
        <label htmlFor="message-body" className="sr-only">
          Message {otherStudentName}
        </label>
        <textarea
          id="message-body"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="Write a message…"
          aria-describedby="message-hint message-count"
          aria-invalid={tooLong || undefined}
          className="w-full resize-y rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="message-hint" className="text-xs text-[var(--ink-soft)]">
            Enter to send, Shift+Enter for a new line.
          </p>

          <div className="flex items-center gap-3">
            <p
              id="message-count"
              className={`text-xs tabular-nums ${tooLong ? "font-semibold text-[var(--danger)]" : "text-[var(--ink-soft)]"}`}
            >
              {trimmedLength}/{MESSAGE_MAX_LENGTH}
              {tooLong ? <span className="sr-only"> characters, too long</span> : null}
            </p>

            <button
              type="submit"
              disabled={!canSend}
              className="rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

type MessageItemProps = {
  mine: boolean;
  pending?: boolean;
  senderName: string;
  body: string;
  footer: ReactNode;
};

function MessageItem({ mine, pending = false, senderName, body, footer }: MessageItemProps) {
  return (
    <li
      className={`flex max-w-[min(85%,42rem)] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"} ${pending ? "opacity-70" : ""}`}
    >
      <p
        className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere] ${
          mine ? "bg-[var(--maroon)] text-white" : "bg-[var(--maroon-100)] text-[var(--ink)]"
        }`}
      >
        <span className="sr-only">{mine ? "You" : senderName}: </span>
        {body}
      </p>
      <span className="text-[11px] text-[var(--ink-soft)]">{footer}</span>
    </li>
  );
}
