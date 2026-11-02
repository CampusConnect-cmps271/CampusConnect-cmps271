"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import {
  HISTORY_ANSWER_MAX_LENGTH,
  HISTORY_MAX_TURNS,
  isCitableUrl,
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
  type AssistantAnswer,
} from "../schema";

const FIELD_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]";

const GENERIC_ERROR = "Something went wrong. Your question is still here; please try again.";

/** The conversation is kept for this browser tab only, and capped. */
const STORAGE_KEY = "campus-assistant-conversation";
const MAX_SAVED_TURNS = 20;

type Turn = { question: string; answer: AssistantAnswer };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const retrievedOn = (iso: string | null) => {
  if (iso === null) return "AUB course catalogue";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown date";
  return `retrieved ${dateFormat.format(date)}`;
};

/** Reads the endpoint's reply; anything off-shape is treated as a failure. */
function readAnswer(body: unknown): AssistantAnswer | null {
  const value = body as Partial<AssistantAnswer> | null;
  if (!value || typeof value.answer !== "string" || !Array.isArray(value.citations)) return null;
  return {
    answer: value.answer,
    insufficient_evidence: value.insufficient_evidence === true,
    // Defence in depth: the server only cites stored official pages, but a link
    // is only rendered if it is one.
    citations: value.citations.filter((citation) => citation && isCitableUrl(citation.url)),
  };
}

const listeners = new Set<() => void>();
let memory: string | null = null;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

function readSaved(): string {
  if (memory !== null) return memory;
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function saveTurns(turns: Turn[]) {
  memory = JSON.stringify(turns);
  try {
    sessionStorage.setItem(STORAGE_KEY, memory);
  } catch {
    // Storage can be unavailable; the conversation then lasts until the page reloads.
  }
  listeners.forEach((listener) => listener());
}

/** The saved conversation, re-checked like a server reply since storage can be edited. */
function parseTurns(saved: string): Turn[] {
  try {
    const items: unknown = JSON.parse(saved);
    if (!Array.isArray(items)) return [];
    return items.flatMap((item: { question?: unknown; answer?: unknown }) => {
      const answer = readAnswer(item?.answer);
      return typeof item?.question === "string" && answer ? [{ question: item.question, answer }] : [];
    });
  } catch {
    return [];
  }
}

/** Conversation with the assistant: each question, its answer and clickable citations. */
export function AssistantPanel() {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept in this tab's session storage; the server render sees an empty conversation.
  const saved = useSyncExternalStore(subscribe, readSaved, () => "[]");
  const turns = useMemo(() => parseTurns(saved), [saved]);
  const [asked, setAsked] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [turns.length, pending]);

  const trimmed = question.trim();
  const tooShort = trimmed.length < QUESTION_MIN_LENGTH;
  const followUp = turns.length > 0;

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    if (pending || tooShort) return;

    setPending(true);
    setAsked(trimmed);
    setError(null);
    try {
      const response = await fetch("/api/campus-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          history: turns.slice(-HISTORY_MAX_TURNS).map((turn) => ({
            question: turn.question,
            answer: turn.answer.answer.slice(0, HISTORY_ANSWER_MAX_LENGTH),
          })),
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message = (body as { message?: unknown } | null)?.message;
        setError(typeof message === "string" ? message : GENERIC_ERROR);
        return;
      }
      const answer = readAnswer(body);
      if (!answer) {
        setError(GENERIC_ERROR);
        return;
      }
      const next = [...turns, { question: trimmed, answer }].slice(-MAX_SAVED_TURNS);
      saveTurns(next);
      setQuestion("");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setPending(false);
      setAsked(null);
    }
  }

  function clearConversation() {
    setError(null);
    saveTurns([]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {(followUp || pending) && (
        <div aria-live="polite" aria-busy={pending} className="flex flex-col gap-4">
          {turns.map((turn, index) => (
            <TurnView key={index} question={turn.question} answer={turn.answer} />
          ))}
          {pending && asked && (
            <>
              <QuestionBubble text={asked} />
              <p className="text-sm text-[var(--ink-soft)]">Searching AUB pages…</p>
            </>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form ref={formRef} onSubmit={ask} className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-white p-4">
        <label htmlFor="assistant-question" className="block text-sm font-semibold text-[var(--ink)]">
          {followUp ? "Ask a follow-up" : "Your question"}
        </label>
        <textarea
          id="assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={QUESTION_MAX_LENGTH}
          rows={3}
          dir="auto"
          placeholder={followUp ? "e.g. And how long does it take?" : "e.g. How do I request a transcript?"}
          aria-describedby="assistant-hint"
          className={FIELD_CLASS}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="assistant-hint" className="text-xs text-[var(--ink-soft)]">
            {question.length}/{QUESTION_MAX_LENGTH} · Ctrl+Enter to ask. Answers come only from official AUB pages and the course catalogue.
          </p>
          <div className="flex items-center gap-2">
            {followUp && (
              <button
                type="button"
                onClick={clearConversation}
                disabled={pending}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
              >
                New conversation
              </button>
            )}
            <button
              type="submit"
              disabled={pending || tooShort}
              className="rounded-md bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
            >
              {pending ? "Searching AUB pages…" : "Ask"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-lg border border-[var(--danger)] bg-white p-4 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

function QuestionBubble({ text }: { text: string }) {
  return (
    <p dir="auto" className="self-end max-w-[85%] whitespace-pre-line rounded-lg bg-[var(--maroon)] px-3 py-2 text-sm text-white">
      {text}
    </p>
  );
}

function TurnView({ question, answer }: Turn) {
  return (
    <>
      <QuestionBubble text={question} />
      <section
        aria-label="Answer"
        className={`rounded-lg border p-4 text-sm text-[var(--ink)] ${
          answer.insufficient_evidence ? "border-[var(--yellow-400)] bg-[var(--yellow-50)]" : "border-[var(--border)] bg-white"
        }`}
      >
        {answer.insufficient_evidence && <h2 className="mb-1 font-semibold">No supporting source found</h2>}
        <p dir="auto" className="whitespace-pre-line">{answer.answer}</p>

        {answer.citations.length > 0 && (
          <div className="mt-4">
            <h2 className="font-semibold">Sources</h2>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              {answer.citations.map((citation) => (
                <li key={citation.chunk_id}>
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--maroon)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
                  >
                    {citation.title}
                  </a>
                  <span className="text-[var(--ink-soft)]"> · {retrievedOn(citation.retrieved_at)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </>
  );
}
