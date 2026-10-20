
"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createPost } from "@/modules/posts/actions";

type Category = {
  id: number;
  name: string;
};

type PostFormProps = {
  categories: Category[];
  initialTitle?: string;
};

const TITLE_MAX = 200;
const BODY_MAX = 10000;
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function PostForm({
  categories,
  initialTitle = "",
}: PostFormProps) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeHydration, clientReady, serverReady);

  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (loading) return;

    setError("");

    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }

    if (!body.trim()) {
      setError("Please enter post content.");
      return;
    }

    if (!category) {
      setError("Please select a category.");
      return;
    }

    setLoading(true);

    try {
      const result = await createPost({
        title,
        body,
        category,
      });

      if (result.fieldErrors) {
        setError(
          Object.values(result.fieldErrors)[0] ??
            "Please check your inputs."
        );
        return;
      }

      if (result.error || !result.postId) {
        setError(
          result.error ?? "Unable to create post."
        );
        return;
      }

      router.push(`/posts/${result.postId}`);
    } catch {
      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <fieldset disabled={!hydrated} className="min-w-0 space-y-6">
        <legend className="sr-only">Post details</legend>
      <div>
        <label
          htmlFor="title"
          className="mb-2 block font-medium"
        >
          Title
        </label>

        <input
          id="title"
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder="Enter your post title"
          className="w-full rounded-lg border border-[var(--border)] p-3 text-inherit"
        />

        <p className="mt-1 text-right text-sm text-[var(--ink-soft)]">
          {title.length}/{TITLE_MAX}
        </p>
      </div>

      <div>
        <label
          htmlFor="category"
          className="mb-2 block font-medium"
        >
          Category
        </label>

        <select
          id="category"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] p-3 text-inherit"
        >
          <option value="">
            Select a category
          </option>

          {categories.map((item) => (
            <option
              key={item.id}
              value={item.name}
            >
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="body"
          className="mb-2 block font-medium"
        >
          Content
        </label>

        <textarea
          id="body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={8}
          placeholder="What would you like to share?"
          className="w-full rounded-lg border border-[var(--border)] p-3 text-inherit"
        />

        <p className="mt-1 text-right text-sm text-[var(--ink-soft)]">
          {body.length}/{BODY_MAX}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || categories.length === 0}
        className="w-full rounded-lg bg-[var(--maroon)] px-5 py-3 font-medium text-white disabled:opacity-50 sm:w-auto"
      >
        {loading
          ? "Publishing..."
          : "Create post"}
      </button>
      </fieldset>
    </form>
  );
}
