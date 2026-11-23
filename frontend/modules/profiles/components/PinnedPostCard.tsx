import Link from "next/link";
import { Pin } from "lucide-react";
import { formatPostDate } from "../pinned-post";
import type { PinnedPost } from "../types";

/** The pinned post at the top of a profile, linking to the full post. */
export function PinnedPostCard({ post }: { post: PinnedPost }) {
  return (
    <section
      aria-labelledby="pinned-post-heading"
      className="w-full min-w-0 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm sm:p-6"
    >
      <h2
        id="pinned-post-heading"
        className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--ink-soft)]"
      >
        <Pin aria-hidden="true" className="size-3.5" />
        Pinned post
      </h2>

      <Link
        href={`/posts/${post.id}`}
        className="group block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--maroon)]"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-[var(--maroon-100)] px-2.5 py-0.5 font-medium text-[var(--maroon)]">
            {post.category}
          </span>
          <time dateTime={post.createdAt} className="text-[var(--ink-soft)]">
            {formatPostDate(post.createdAt)}
          </time>
        </div>

        <h3 className="break-words text-lg font-semibold text-[var(--ink)] group-hover:underline">
          {post.title}
        </h3>

        {post.excerpt ? (
          <p className="mt-1 break-words text-sm text-[var(--ink-soft)]">{post.excerpt}</p>
        ) : null}
      </Link>
    </section>
  );
}
