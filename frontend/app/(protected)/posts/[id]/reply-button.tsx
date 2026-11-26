"use client";

import { useRef, useState } from "react";
import CommentForm from "./comment-form";

type ReplyButtonProps = {
  postId: string;
  parentId: string;
};

export default function ReplyButton({
  postId,
  parentId,
}: ReplyButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    // The form unmounts, so give focus back to the control that opened it.
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  if (!open) {
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-md px-2 text-xs text-[var(--maroon)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
      >
        Reply
      </button>
    );
  }

  return (
    <div className="mt-2 w-full">
      <CommentForm
        postId={postId}
        parentId={parentId}
        placeholder="Write a reply…"
        submitLabel="Reply"
        autoFocus
        onDone={close}
      />
    </div>
  );
}
