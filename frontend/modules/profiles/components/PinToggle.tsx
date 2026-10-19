"use client";

import { useState, useTransition } from "react";
import { Pin, PinOff } from "lucide-react";
import { pinPost, unpinPost } from "../pin-actions";

/**
 * "Pin to profile" / "Unpin" for one of the student's own posts. The label
 * comes from the server: the action re-renders the page with the new state.
 */
export function PinToggle({ postId, pinned }: { postId: string; pinned: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    setError("");
    startTransition(async () => {
      try {
        const result = pinned ? await unpinPost(postId) : await pinPost(postId);
        if ("error" in result) setError(result.error);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  const Icon = pinned ? PinOff : Pin;
  const label = pinned ? "Unpin" : "Pin to profile";

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--maroon-50)] disabled:opacity-50"
      >
        <Icon aria-hidden="true" className="size-4" />
        {pending ? (pinned ? "Unpinning…" : "Pinning…") : label}
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-[var(--danger)] dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
