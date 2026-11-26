"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveClubAnnouncement, type ClubActionState } from "../actions";
import type { ClubAnnouncement, ClubProfile } from "../types";

export function AnnouncementForm({ club, announcement }: { club: ClubProfile; announcement?: ClubAnnouncement }) {
  const [state, action, pending] = useActionState<ClubActionState, FormData>(saveClubAnnouncement, undefined);
  return <form action={action} className="space-y-5">
    <input type="hidden" name="clubId" value={club.id} /><input type="hidden" name="slug" value={club.slug} />
    {announcement ? <input type="hidden" name="announcementId" value={announcement.id} /> : null}
    <div><label htmlFor="title" className="block text-sm font-semibold">Title</label><input id="title" name="title" required minLength={3} maxLength={160} defaultValue={announcement?.title} aria-describedby="announcement-title-help" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]" /><p id="announcement-title-help" className="mt-1 text-xs text-[var(--ink-soft)]">Use a short title students can scan quickly.</p></div>
    <div><label htmlFor="body" className="block text-sm font-semibold">Announcement</label><textarea id="body" name="body" required minLength={10} maxLength={5000} rows={10} defaultValue={announcement?.body} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]" /></div>
    {state?.status === "error" ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{state.message}</p> : null}
    <div className="rounded-lg border border-[var(--border)] bg-[var(--maroon-50)] p-3 text-sm text-[var(--ink-soft)]"><strong className="text-[var(--ink)]">Before publishing:</strong> the announcement becomes visible to every signed-in student. A draft remains visible only to club managers.</div>
    <div className="flex flex-col gap-3 sm:flex-row"><button name="intent" value="publish" disabled={pending} className="min-h-11 rounded-lg bg-[var(--maroon)] px-5 py-2 font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Publish announcement"}</button><button name="intent" value="draft" disabled={pending} className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-5 py-2 font-semibold text-[var(--maroon)]">Save as draft</button><Link href={`/clubs/${club.slug}`} className="min-h-11 px-3 py-2 text-center text-sm font-semibold text-[var(--ink-soft)]">Cancel</Link></div>
  </form>;
}
