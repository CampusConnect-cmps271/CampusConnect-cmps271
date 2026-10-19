import { createClient } from "@/lib/supabase/server";
import CommentForm from "./comment-form";
import ReplyButton from "./reply-button";
import ReportDialog from "@/modules/moderation/report-dialog";

type CommentRow = {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  status: "published" | "removed";
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
    .select("id, author_id, parent_id, body, status, created_at")
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
    <p className="mb-1 text-xs text-[var(--ink-soft)]">
      {comment.author_id === userId ? "You" : "CampusConnect student"}
      {" · "}
      <time>{new Date(comment.created_at).toLocaleString("en-US", { timeZone: "Asia/Beirut" })}</time>
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
      className="mt-8 border-t border-[var(--border)] pt-6"
    >
      <h2 id="comments-heading" className="mb-4 text-lg font-semibold">
        Comments ({comments.length})
      </h2>

      <CommentForm postId={postId} />

      {topLevel.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--ink-soft)]">
          No comments yet. Be the first to comment.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {topLevel.map((comment) => (
            <li key={comment.id} id={`comment-${comment.id}`}>
              <CommentMeta comment={comment} userId={userId} />

              {comment.status === "removed" ? (
                <p className="text-sm italic opacity-70">Removed by a moderator.</p>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {comment.body}
                </p>
              )}

              {comment.status === "published" ? (
                <div className="mt-2 flex flex-wrap items-start gap-4">
                  <ReplyButton postId={postId} parentId={comment.id} />
                  {comment.author_id !== userId ? (
                    <ReportDialog targetType="comment" targetId={comment.id} />
                  ) : null}
                </div>
              ) : null}

              {(repliesByParent.get(comment.id) ?? []).length > 0 && (
                <ul className="mt-3 space-y-3 border-l border-[var(--border)] pl-4">
                  {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                    <li key={reply.id} id={`comment-${reply.id}`}>
                      <CommentMeta comment={reply} userId={userId} />

                      {reply.status === "removed" ? (
                        <p className="text-sm italic opacity-70">Removed by a moderator.</p>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap break-words text-sm leading-6">
                            {reply.body}
                          </p>
                          {reply.author_id !== userId ? (
                            <div className="mt-2">
                              <ReportDialog targetType="comment" targetId={reply.id} />
                            </div>
                          ) : null}
                        </>
                      )}
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
