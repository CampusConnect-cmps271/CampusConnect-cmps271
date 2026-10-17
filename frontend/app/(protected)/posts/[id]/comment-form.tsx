"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/modules/comments/actions";

type CommentFormProps = {
  postId: string;
  parentId?: string;
  placeholder?: string;
  submitLabel?: string;
  onDone?: () => void;
};

export default function CommentForm({
  postId,
  parentId,
  placeholder = "Write a comment…",
  submitLabel = "Comment",
  onDone,
}: CommentFormProps) {
  const router = useRouter();

  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

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
      router.refresh();
      onDone?.();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        aria-label={parentId ? "Write a reply" : "Write a comment"}
        maxLength={2000}
        rows={parentId ? 2 : 3}
        className="w-full rounded-lg border border-gray-600 bg-transparent p-3 text-sm"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || body.trim().length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Posting…" : submitLabel}
        </button>

        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-gray-400 hover:underline"
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
