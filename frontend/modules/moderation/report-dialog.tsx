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
        className="text-xs font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-300"
      >
        Report {targetType}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-red-700/30 bg-red-950/10 p-4">
      <h3 className="font-semibold">Report this {targetType}</h3>

      {submitted ? (
        <div className="mt-2">
          <p role="status" className="text-sm text-green-700 dark:text-green-300">
            {message}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 text-sm underline"
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
              className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 dark:bg-gray-900 dark:text-white"
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
              className="mt-1 block w-full rounded-md border border-gray-400 bg-transparent px-3 py-2"
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
              className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Submitting…" : "Submit report"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

