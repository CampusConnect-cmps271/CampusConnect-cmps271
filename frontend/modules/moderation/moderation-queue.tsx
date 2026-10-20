"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { moderateReportedContent } from "./actions";

export type ModerationQueueItem = {
  target_type: "post" | "comment" | "review";
  target_id: string;
  post_id: string | null;
  course_code: string | null;
  author_id: string;
  report_count: number;
  reasons: string[];
  preview: string;
  oldest_reported_at: string;
};

export default function ModerationQueue({ items }: { items: ModerationQueueItem[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  async function decide(item: ModerationQueueItem, decision: "remove" | "dismiss") {
    if (reason.trim().length < 3) {
      setMessage("Enter a reason before applying a decision.");
      return;
    }

    setActiveId(item.target_id);
    setMessage("");
    const result = await moderateReportedContent({
      targetType: item.target_type,
      targetId: item.target_id,
      decision,
      reason,
    });
    setActiveId(null);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setReason("");
    setMessage(decision === "remove" ? "Content removed." : "Reports dismissed.");
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="rounded-xl border p-6 text-sm">There are no open reports.</p>;
  }

  return (
    <div className="space-y-4">
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      {items.map((item) => (
        <article key={`${item.target_type}-${item.target_id}`} className="rounded-xl border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold capitalize">Reported {item.target_type}</h2>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
              {item.report_count} {item.report_count === 1 ? "report" : "reports"}
            </span>
          </div>

          <p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.preview}</p>
          <dl className="mt-3 grid gap-1 text-xs opacity-75">
            <div><dt className="inline font-semibold">Reasons:</dt> <dd className="inline">{item.reasons.join(", ")}</dd></div>
            <div><dt className="inline font-semibold">First reported:</dt> <dd className="inline">{new Date(item.oldest_reported_at).toLocaleString()}</dd></div>
          </dl>

          <Link
            href={item.target_type === "review"
              ? `/courses/${encodeURIComponent(item.course_code ?? "")}#review-${item.target_id}`
              : `/posts/${item.post_id}${item.target_type === "comment" ? `#comment-${item.target_id}` : ""}`}
            className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300"
          >
            View reported item
          </Link>

          <label className="mt-4 block text-sm">
            Decision reason
            <input
              value={activeId === item.target_id ? reason : ""}
              onFocus={() => {
                setActiveId(item.target_id);
                setReason("");
              }}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              className="mt-1 block w-full rounded-md border bg-transparent px-3 py-2"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={activeId === item.target_id && !reason.trim()}
              onClick={() => decide(item, "remove")}
              className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Remove content
            </button>
            <button
              type="button"
              disabled={activeId === item.target_id && !reason.trim()}
              onClick={() => decide(item, "dismiss")}
              className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Dismiss reports
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

