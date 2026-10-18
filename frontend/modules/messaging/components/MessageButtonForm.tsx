"use client";

import { useActionState } from "react";
import { MessageCircle } from "lucide-react";
import type { StartConversationState } from "../actions";

type MessageButtonFormProps = {
  /** startConversation, already bound to the other student's id. */
  action: () => Promise<StartConversationState>;
  studentName: string;
};

export function MessageButtonForm({ action, studentName }: MessageButtonFormProps) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
      >
        <MessageCircle aria-hidden="true" className="size-4" />
        {pending ? (
          "Opening…"
        ) : (
          <>
            Message<span className="sr-only"> {studentName}</span>
          </>
        )}
      </button>

      {state?.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
