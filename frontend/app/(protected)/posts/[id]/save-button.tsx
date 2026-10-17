"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleSavedPost } from "@/modules/saved/actions";

type SaveButtonProps = {
  postId: string;
  initiallySaved: boolean;
};

export default function SaveButton({
  postId,
  initiallySaved,
}: SaveButtonProps) {
  const router = useRouter();

  const [saved, setSaved] = useState(initiallySaved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await toggleSavedPost(postId);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSaved(result.saved ?? false);
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
        onClick={handleToggle}
        disabled={loading}
        aria-pressed={saved}
        className={`rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
          saved
            ? "border-blue-500 bg-blue-600/20 text-blue-400"
            : "border-gray-600 text-gray-300 hover:bg-gray-800"
        }`}
      >
        {saved ? "★ Saved" : "☆ Save"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
