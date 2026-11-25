"use client";

import { useState } from "react";
import { submitContentReport } from "./actions";
import type { ReportReason } from "./schema";

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "offensive", label: "Offensive content" },
  { value: "misleading", label: "Misleading information" },
  { value: "other", label: "Other" },
];

export default function ReportDialog({
  targetType,
  targetId,
}: {
  targetType: "post" | "comment" | "review";
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const titleId = `report-${targetType}-${targetId}-title`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setMessage("");
    const result = await submitContentReport({
      targetType,
      targetId,
      reason,
      details,
    });
    setPending(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setSubmitted(true);
    setMessage("Report submitted. Thank you for helping keep CampusConnect safe.");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="min-h-10 rounded-lg px-2 text-xs font-semibold text-[var(--danger)] underline-offset-2 hover:bg-red-50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
      >
        Report {targetType}
      </button>
    );
  }

  return (
    <section aria-labelledby={titleId} className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-[var(--ink)]">
      <h3 id={titleId} className="font-semibold">Report this {targetType}</h3>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">Reports are private and reviewed by the moderation team.</p>

      {submitted ? (
        <div className="mt-2">
          <p role="status" className="text-sm text-green-700 dark:text-green-300">
            {message}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--maroon)] underline"
          >
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label className="block text-sm">
            Reason
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as ReportReason)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
            >
              {REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Details (optional)
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
            />
          </label>

          {message ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {message}
            </p>
          ) : null}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-lg bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
            >
              {pending ? "Submitting…" : "Submit report"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

