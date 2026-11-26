"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { archiveCommunity } from "../actions";
import { DANGER_BUTTON, SECONDARY_BUTTON } from "./styles";

/**
 * Archive, with a confirm step. Shown to the owner, moderators and
 * administrators; the database checks again.
 */
export function ArchiveControl({ communityId, slug, name }: { communityId: string; slug: string; name: string }) {
  const [state, formAction, pending] = useActionState(archiveCommunity, undefined);
  const [confirming, setConfirming] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (wasConfirming.current) openButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <form
          action={formAction}
          aria-labelledby={`archive-${communityId}`}
          className="flex flex-col gap-2 rounded-lg border border-[var(--danger)] bg-[#fdecea] p-3"
        >
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="slug" value={slug} />
          <p id={`archive-${communityId}`} className="text-sm text-[var(--ink)]">
            Archive {name}? It leaves discovery and takes no new members or posts. Its page and posts stay readable. This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button ref={confirmButton} type="submit" disabled={pending} className={DANGER_BUTTON}>
              {pending ? "Archiving…" : "Yes, archive"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={SECONDARY_BUTTON}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button ref={openButton} type="button" onClick={() => setConfirming(true)} className={DANGER_BUTTON}>
            Archive
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-sm text-[var(--danger)]">
        {state && !state.ok ? state.message : null}
      </p>
    </div>
  );
}
