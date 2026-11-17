"use client";

import { useActionState } from "react";
import { joinCommunity } from "../actions";
import { PRIMARY_BUTTON } from "./styles";

/** "Join to post" beside a community's posts: joins (and follows) in one click. */
export function JoinToPostButton({ communityId, slug }: { communityId: string; slug: string }) {
  const [state, formAction, pending] = useActionState(joinCommunity, undefined);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="slug" value={slug} />
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? "Joining…" : "Join to post"}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-[var(--danger)]">
        {state && !state.ok ? state.message : null}
      </p>
    </form>
  );
}
