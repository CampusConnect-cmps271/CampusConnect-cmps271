
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editPost } from "@/modules/posts/edit-actions";

type Category = {
  id: number;
  name: string;
};

type Post = {
  id: string;
  title: string;
  body: string;
  category: string;
};

export default function EditPostForm({
  post,
  categories,
}: {
  post: Post;
  categories: Category[];
}) {
  const router = useRouter();

  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [category, setCategory] = useState(post.category);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const result = await editPost(post.id, {
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

      if (!result.success) {
        setError(result.error ?? "Unable to update post.");
        return;
      }

      router.push(`/posts/${post.id}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="mb-2 block font-medium">
          Title
        </label>

        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          className="w-full rounded-lg border border-gray-600 bg-transparent p-3"
        />

        <p className="mt-1 text-right text-sm opacity-60">
          {title.length}/200
        </p>
      </div>

      <div>
        <label htmlFor="category" className="mb-2 block font-medium">
          Category
        </label>

        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white"
        >
          {categories.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="body" className="mb-2 block font-medium">
          Content
        </label>

        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={10000}
          rows={8}
          required
          className="w-full rounded-lg border border-gray-600 bg-transparent p-3"
        />

        <p className="mt-1 text-right text-sm opacity-60">
          {body.length}/10000
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save changes"}
        </button>

        <button
          type="button"
          onClick={() => router.push(`/posts/${post.id}`)}
          className="rounded-lg border border-gray-600 px-5 py-3"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
