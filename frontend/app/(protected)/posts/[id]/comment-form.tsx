"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/modules/comments/actions";

type CommentFormProps = {
  postId: string;
  parentId?: string;
  placeholder?: string;
  submitLabel?: string;
  /** Move focus into the box on mount; used when a reply box is opened on purpose. */
  autoFocus?: boolean;
  onDone?: () => void;
};

const MAX_LENGTH = 2000;
/** The counter appears only when the limit is near, so it is not noise on short comments. */
const COUNTER_FROM = MAX_LENGTH - 200;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

export default function CommentForm({
  postId,
  parentId,
  placeholder = "Write a comment…",
  submitLabel = "Comment",
  autoFocus = false,
  onDone,
}: CommentFormProps) {
  const router = useRouter();

  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState(false);

  async function submit() {
    if (loading || body.trim().length === 0) return;

    setLoading(true);
    setError("");
    setPosted(false);

    try {
      const result = await addComment(postId, {
        body,
        parentId: parentId ?? null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setBody("");
      setPosted(true);
      router.refresh();
      onDone?.();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  }

  const counterId = `${parentId ?? "top"}-counter`;
  const showCounter = body.length >= COUNTER_FROM;

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setPosted(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={parentId ? "Write a reply" : "Write a comment"}
        aria-describedby={showCounter ? counterId : undefined}
        maxLength={MAX_LENGTH}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-[var(--border)] bg-transparent p-3 text-sm focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading || body.trim().length === 0}
          className={`min-h-11 rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--maroon-dark)] disabled:opacity-50 ${FOCUS}`}
        >
          {loading ? "Posting…" : submitLabel}
        </button>

        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className={`min-h-11 rounded-lg px-2 text-sm text-[var(--ink-soft)] hover:underline ${FOCUS}`}
          >
            Cancel
          </button>
        )}

        {showCounter && (
          <p id={counterId} className="ml-auto text-xs text-[var(--ink-soft)]">
            {body.length}/{MAX_LENGTH}
          </p>
        )}
      </div>

      {/* Announces success to screen readers; the new comment appears after the refresh. */}
      <p role="status" className="sr-only">
        {posted ? (parentId ? "Reply posted." : "Comment posted.") : ""}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </form>
  );
}
