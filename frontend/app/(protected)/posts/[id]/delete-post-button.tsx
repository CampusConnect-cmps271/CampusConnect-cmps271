
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePost } from "@/modules/posts/delete-actions";

type DeletePostButtonProps = {
  postId: string;
};

export default function DeletePostButton({
  postId,
}: DeletePostButtonProps) {
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (deleting) return;

    setDeleting(true);
    setError("");

    try {
      const result = await deletePost(postId);

      if (result.error) {
        setError(result.error);
        setDeleting(false);
        return;
      }

      router.push("/home");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setConfirming(true);
        }}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Delete post
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-post-title"
            aria-describedby="delete-post-description"
            className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl"
          >
            <h2
              id="delete-post-title"
              className="text-xl font-semibold text-white"
            >
              Delete this post?
            </h2>

            <p
              id="delete-post-description"
              className="mt-3 text-sm text-gray-300"
            >
              This post will disappear from the feed and will
              no longer be visible to other students.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-4 text-sm text-red-400"
              >
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
