"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { isCitableUrl, QUESTION_MAX_LENGTH, QUESTION_MIN_LENGTH, type AssistantAnswer } from "../schema";

const FIELD_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]";

const GENERIC_ERROR = "Something went wrong. Your question is still here; please try again.";

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

/** Question box, answer and its clickable citations. */
export function AssistantPanel() {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantAnswer | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const trimmed = question.trim();
  const tooShort = trimmed.length < QUESTION_MIN_LENGTH;

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    if (pending || tooShort) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/campus-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
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
      setResult(answer);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form ref={formRef} onSubmit={ask} className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-white p-4">
        <label htmlFor="assistant-question" className="block text-sm font-semibold text-[var(--ink)]">
          Your question
        </label>
        <textarea
          id="assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={QUESTION_MAX_LENGTH}
          rows={3}
          dir="auto"
          placeholder="e.g. How do I request a transcript?"
          aria-describedby="assistant-hint"
          className={FIELD_CLASS}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="assistant-hint" className="text-xs text-[var(--ink-soft)]">
            {question.length}/{QUESTION_MAX_LENGTH} · Ctrl+Enter to ask. Answers come only from official AUB pages and the course catalogue.
          </p>
          <button
            type="submit"
            disabled={pending || tooShort}
            className="rounded-md bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
          >
            {pending ? "Searching AUB pages…" : "Ask"}
          </button>
        </div>
      </form>

      <div aria-live="polite" aria-busy={pending} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-lg border border-[var(--danger)] bg-white p-4 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        {result && !pending && (
          <section
            aria-label="Answer"
            className={`rounded-lg border p-4 text-sm text-[var(--ink)] ${
              result.insufficient_evidence ? "border-[var(--yellow-400)] bg-[var(--yellow-50)]" : "border-[var(--border)] bg-white"
            }`}
          >
            {result.insufficient_evidence && <h2 className="mb-1 font-semibold">No supporting source found</h2>}
            <p dir="auto" className="whitespace-pre-line">{result.answer}</p>

            {result.citations.length > 0 && (
              <div className="mt-4">
                <h2 className="font-semibold">Sources</h2>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {result.citations.map((citation) => (
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
        )}
      </div>
    </div>
  );
}
