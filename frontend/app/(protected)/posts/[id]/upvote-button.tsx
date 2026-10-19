
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { togglePostUpvote } from "@/modules/posts/upvote-actions";

type UpvoteButtonProps = {
  postId: string;
  initialCount: number;
  initiallyUpvoted: boolean;
};

export default function UpvoteButton({
  postId,
  initialCount,
  initiallyUpvoted,
}: UpvoteButtonProps) {
  const router = useRouter();

  const [count, setCount] = useState(initialCount);
  const [upvoted, setUpvoted] = useState(initiallyUpvoted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpvote() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await togglePostUpvote(postId);

      if (result.error) {
        setError(result.error);
        return;
      }

      setUpvoted(result.upvoted ?? false);
      setCount((previous) =>
        previous + (result.upvoted ? 1 : -1)
      );

      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleUpvote}
        disabled={loading}
        aria-pressed={upvoted}
        className={`rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
          upvoted
            ? "border-[var(--maroon)] bg-[var(--maroon-100)] text-[var(--maroon)]"
            : "border-[var(--border)] text-[var(--ink-soft)] hover:bg-[var(--maroon-50)]"
        }`}
      >
        {upvoted ? "▲ Upvoted" : "▲ Upvote"} ({count})
      </button>

      {error && (
        <p role="alert" className="mt-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
