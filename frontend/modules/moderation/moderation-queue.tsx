"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { moderateReportedContent } from "./actions";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

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
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function decide(item: ModerationQueueItem, decision: "remove" | "dismiss") {
    const itemKey = `${item.target_type}-${item.target_id}`;
    if (activeKey !== itemKey) {
      setMessage({ kind: "error", text: "Select this report and enter its decision reason first." });
      return;
    }
    if (reason.trim().length < 3) {
      setMessage({ kind: "error", text: "Enter at least three characters before applying a decision." });
      return;
    }

    setMessage(null);
    const result = await moderateReportedContent({
      targetType: item.target_type,
      targetId: item.target_id,
      decision,
      reason,
    });
    setActiveKey(null);

    if (result.error) {
      setMessage({ kind: "error", text: result.error });
      return;
    }

    setReason("");
    setMessage({ kind: "success", text: decision === "remove" ? "Content removed and audit history preserved." : "Reports dismissed and decision recorded." });
    router.refresh();
  }

  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center"><h2 className="text-lg font-bold text-[var(--ink)]">Queue clear</h2><p className="mt-2 text-sm text-[var(--ink-soft)]">There are no open reports requiring a decision.</p></div>;
  }

  return (
    <div className="space-y-4">
      {message ? <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-[var(--danger)]" : "border-emerald-200 bg-emerald-50 text-[var(--success)]"}`}>{message.text}</p> : null}
      {items.map((item) => (
        <article key={`${item.target_type}-${item.target_id}`} className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold capitalize">Reported {item.target_type}</h2>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
              {item.report_count} {item.report_count === 1 ? "report" : "reports"}
            </span>
          </div>

          <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-[var(--maroon-50)] p-4 text-sm leading-6 text-[var(--ink)]">{item.preview}</p>
          <dl className="mt-3 grid gap-1 text-xs text-[var(--ink-soft)]">
            <div><dt className="inline font-semibold">Reasons:</dt> <dd className="inline">{item.reasons.join(", ")}</dd></div>
            <div><dt className="inline font-semibold">First reported:</dt> <dd className="inline">{new Date(item.oldest_reported_at).toLocaleString()}</dd></div>
          </dl>

          <Link
            href={item.target_type === "review"
              ? `/courses/${encodeURIComponent(item.course_code ?? "")}#review-${item.target_id}`
              : `/posts/${item.post_id}${item.target_type === "comment" ? `#comment-${item.target_id}` : ""}`}
            className={`mt-3 inline-block text-sm font-semibold text-[var(--maroon)] hover:underline ${FOCUS}`}
          >
            View reported item
          </Link>

          <label className="mt-4 block text-sm font-semibold text-[var(--ink)]">
            Decision reason <span className="font-normal text-[var(--ink-soft)]">(required)</span>
            <input
              value={activeKey === `${item.target_type}-${item.target_id}` ? reason : ""}
              onFocus={() => {
                setActiveKey(`${item.target_type}-${item.target_id}`);
                setReason("");
              }}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              aria-describedby={`reason-help-${item.target_type}-${item.target_id}`}
              className={`mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[var(--ink)] ${FOCUS}`}
            />
          </label>
          <p id={`reason-help-${item.target_type}-${item.target_id}`} className="mt-1 text-xs text-[var(--ink-soft)]">The reason is included in the protected audit log.</p>

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={activeKey !== `${item.target_type}-${item.target_id}` || reason.trim().length < 3}
              onClick={() => decide(item, "remove")}
              className={`min-h-11 rounded-lg bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            >
              Remove content
            </button>
            <button
              type="button"
              disabled={activeKey !== `${item.target_type}-${item.target_id}` || reason.trim().length < 3}
              onClick={() => decide(item, "dismiss")}
              className={`min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            >
              Dismiss reports
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

