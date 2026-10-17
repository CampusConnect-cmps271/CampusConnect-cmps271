import { createClient } from "@/lib/supabase/server";
import CommentForm from "./comment-form";
import ReplyButton from "./reply-button";

type CommentRow = {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
};

type CommentSectionProps = {
  postId: string;
  userId: string;
  comments: CommentRow[];
};

export async function loadComments(postId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("post_comments")
    .select("id, author_id, parent_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load comments:", error);
    throw new Error("Failed to load comments.");
  }

  return (data ?? []) as CommentRow[];
}

function CommentMeta({
  comment,
  userId,
}: {
  comment: CommentRow;
  userId: string;
}) {
  return (
    <p className="mb-1 text-xs text-gray-400">
      {comment.author_id === userId ? "You" : "CampusConnect student"}
      {" · "}
      <time>{new Date(comment.created_at).toLocaleString()}</time>
    </p>
  );
}

export default function CommentSection({
  postId,
  userId,
  comments,
}: CommentSectionProps) {
  const topLevel = comments.filter((comment) => !comment.parent_id);

  const repliesByParent = new Map<string, CommentRow[]>();

  for (const comment of comments) {
    if (!comment.parent_id) continue;

    const siblings = repliesByParent.get(comment.parent_id) ?? [];
    siblings.push(comment);
    repliesByParent.set(comment.parent_id, siblings);
  }

  return (
    <section
      aria-labelledby="comments-heading"
      className="mt-8 border-t border-gray-700 pt-6"
    >
      <h2 id="comments-heading" className="mb-4 text-lg font-semibold">
        Comments ({comments.length})
      </h2>

      <CommentForm postId={postId} />

      {topLevel.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">
          No comments yet. Be the first to comment.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {topLevel.map((comment) => (
            <li key={comment.id}>
              <CommentMeta comment={comment} userId={userId} />

              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {comment.body}
              </p>

              <div className="mt-1">
                <ReplyButton postId={postId} parentId={comment.id} />
              </div>

              {(repliesByParent.get(comment.id) ?? []).length > 0 && (
                <ul className="mt-3 space-y-3 border-l border-gray-700 pl-4">
                  {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                    <li key={reply.id}>
                      <CommentMeta comment={reply} userId={userId} />

                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {reply.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
