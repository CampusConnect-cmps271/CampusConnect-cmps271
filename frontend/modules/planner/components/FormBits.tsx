"use client";

import { useSyncExternalStore } from "react";

export const FIELD_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)] aria-[invalid=true]:border-[var(--danger)]";

export const LABEL_CLASS = "block text-xs font-semibold text-[var(--ink)]";

export const PRIMARY_BUTTON =
  "rounded-md bg-[var(--maroon)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60";

export const SECONDARY_BUTTON =
  "rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60";

const noSubscription = () => () => {};

/** False in the server HTML and until hydration, then true. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-[var(--danger)]">
      {message}
    </p>
  );
}
