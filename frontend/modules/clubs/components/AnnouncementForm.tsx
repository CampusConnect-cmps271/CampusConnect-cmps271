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
    <div><label htmlFor="title" className="block text-sm font-semibold">Title</label><input id="title" name="title" required minLength={3} maxLength={160} defaultValue={announcement?.title} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--ink)]" /></div>
    <div><label htmlFor="body" className="block text-sm font-semibold">Announcement</label><textarea id="body" name="body" required minLength={10} maxLength={5000} rows={10} defaultValue={announcement?.body} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--ink)]" /></div>
    {state?.status === "error" ? <p role="alert" className="text-sm text-[var(--danger)]">{state.message}</p> : null}
    <div className="flex flex-wrap gap-3"><button name="intent" value="publish" disabled={pending} className="rounded-lg bg-[var(--maroon)] px-5 py-2 font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Publish"}</button><button name="intent" value="draft" disabled={pending} className="rounded-lg border border-[var(--border)] bg-white px-5 py-2 font-semibold text-[var(--maroon)]">Save draft</button><Link href={`/clubs/${club.slug}`} className="px-3 py-2 text-sm font-semibold text-[var(--ink-soft)]">Cancel</Link></div>
  </form>;
}
