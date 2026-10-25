"use client";

import { useActionState } from "react";
import type { ClubActionState } from "../actions";

export function ActionForm({ action, children, className = "", successMessage }: {
  action: (state: ClubActionState, formData: FormData) => Promise<ClubActionState>;
  children: React.ReactNode; className?: string; successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return <form action={formAction} className={className} aria-busy={pending}>
    {children}
    {pending ? <p className="text-sm text-[var(--ink-soft)]">Saving…</p> : null}
    {state ? <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{state.status === "success" && successMessage ? successMessage : state.message}</p> : null}
  </form>;
}
