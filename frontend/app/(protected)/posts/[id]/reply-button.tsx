"use client";

import { useState } from "react";
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--maroon)] hover:underline"
      >
        Reply
      </button>
    );
  }

  return (
    <div className="mt-2">
      <CommentForm
        postId={postId}
        parentId={parentId}
        placeholder="Write a reply…"
        submitLabel="Reply"
        onDone={() => setOpen(false)}
      />
    </div>
  );
}
