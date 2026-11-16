"use client";

import { useActionState, useEffect, useRef, useState, type Ref } from "react";
import {
  followCommunity,
  joinCommunity,
  leaveCommunity,
  unfollowCommunity,
  type CommunityActionState,
} from "../actions";
import type { Membership } from "../types";
import { DANGER_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles";

type Action = (state: CommunityActionState, formData: FormData) => Promise<CommunityActionState>;

type ButtonFormProps = {
  action: Action;
  communityId: string;
  slug: string;
  label: string;
  pendingLabel: string;
  className: string;
  onResult: (state: CommunityActionState) => void;
  buttonRef?: Ref<HTMLButtonElement>;
};

/** One button that runs one action, and reports what happened. */
function ButtonForm({ action, communityId, slug, label, pendingLabel, className, onResult, buttonRef }: ButtonFormProps) {
  const [, formAction, pending] = useActionState(async (previous: CommunityActionState, formData: FormData) => {
    const result = await action(previous, formData);
    onResult(result);
    return result;
  }, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="slug" value={slug} />
      <button ref={buttonRef} type="submit" disabled={pending} className={className}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}

type MembershipControlsProps = {
  communityId: string;
  slug: string;
  name: string;
  membership: Membership;
};

/**
 * Join / Leave and Follow / Unfollow for an active community, showing where
 * the student stands. Leaving asks first. The owner cannot leave, so they get
 * no Leave button.
 */
export function MembershipControls({ communityId, slug, name, membership }: MembershipControlsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const leaveButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (wasConfirming.current) leaveButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const report = (state: CommunityActionState) => setMessage(state && !state.ok ? (state.message ?? null) : null);
  const shared = { communityId, slug, onResult: report };
  const isMember = membership.role !== null;

  const standing =
    membership.role === "owner"
      ? "You own this community"
      : membership.role === "member"
        ? "You're a member"
        : membership.following
          ? "You follow this community"
          : null;

  return (
    <div className="flex flex-col gap-2">
      {standing ? (
        <p className="text-sm font-medium text-[var(--ink)]">
          {standing}
          {isMember ? (membership.following ? " and follow it" : ", not following") : null}.
        </p>
      ) : null}

      {confirming ? (
        <div role="group" aria-labelledby={`leave-${communityId}`} className="flex flex-col gap-2 rounded-lg border border-[var(--danger)] bg-[#fdecea] p-3">
          <p id={`leave-${communityId}`} className="text-sm text-[var(--ink)]">
            Leave {name}? You&apos;ll stop following it and won&apos;t be able to post in it.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonForm
              {...shared}
              action={leaveCommunity}
              label="Yes, leave"
              pendingLabel="Leaving…"
              className={DANGER_BUTTON}
              buttonRef={confirmButton}
              onResult={(state) => {
                report(state);
                setConfirming(false);
              }}
            />
            <button type="button" onClick={() => setConfirming(false)} className={SECONDARY_BUTTON}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {!isMember ? (
            <ButtonForm {...shared} action={joinCommunity} label="Join" pendingLabel="Joining…" className={PRIMARY_BUTTON} />
          ) : membership.role === "member" ? (
            <button ref={leaveButton} type="button" onClick={() => setConfirming(true)} className={SECONDARY_BUTTON}>
              Leave
            </button>
          ) : null}
          {membership.following ? (
            <ButtonForm {...shared} action={unfollowCommunity} label="Unfollow" pendingLabel="Saving…" className={SECONDARY_BUTTON} />
          ) : (
            <ButtonForm {...shared} action={followCommunity} label="Follow" pendingLabel="Saving…" className={SECONDARY_BUTTON} />
          )}
        </div>
      )}

      <p role="status" aria-live="polite" className="text-sm text-[var(--danger)]">
        {message}
      </p>
    </div>
  );
}
