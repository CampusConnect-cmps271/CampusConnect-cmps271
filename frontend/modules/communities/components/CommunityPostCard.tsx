import Link from "next/link";
import type { CommunityPost } from "../types";
import { CARD, FOCUS, formatDate, plural } from "./styles";

/**
 * A community post in a list: who wrote it and in which community, then the
 * post. The feed's own card is not exported, so this is a small one of the
 * same shape; the post's page is the normal one.
 */
export function CommunityPostCard({ post }: { post: CommunityPost }) {
  return (
    <article className={`${CARD} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ink-soft)]">
        <span className="rounded-full bg-[var(--maroon-100)] px-2.5 py-0.5 font-medium text-[var(--maroon)]">{post.category}</span>
        <span>
          <span className="font-semibold text-[var(--ink)]">{post.authorName ?? "CampusConnect student"}</span> in{" "}
          <Link href={`/communities/${post.communitySlug}`} className={`font-semibold text-[var(--maroon)] hover:underline ${FOCUS}`}>
            {post.communityName}
          </Link>{" "}
          · <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
        </span>
      </div>
      <h3 className="text-base font-semibold text-[var(--ink)]">
        <Link href={`/posts/${post.id}`} className={`hover:text-[var(--maroon)] hover:underline ${FOCUS}`}>
          {post.title}
        </Link>
      </h3>
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-[var(--ink-soft)]">{post.body}</p>
      <p className="text-xs text-[var(--ink-soft)]">
        {plural(post.upvoteCount, "upvote")} · {plural(post.commentCount, "comment")}
      </p>
    </article>
  );
}
