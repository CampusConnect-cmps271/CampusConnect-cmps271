import Link from "next/link";
import { requestClubVerification } from "../actions";
import type { ClubAnnouncement, ClubProfile } from "../types";
import { ActionForm } from "./ActionForm";
import { VerificationBadge } from "./ClubDirectory";

export function ClubProfileView({ club, announcements, canManage, representative }: { club: ClubProfile; announcements: ClubAnnouncement[]; canManage: boolean; representative: boolean }) {
  return <>
    <header className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold text-[var(--maroon)]">{club.category}</p><h1 className="mt-2 text-3xl font-bold text-[var(--ink)] sm:text-4xl">{club.name}</h1></div><VerificationBadge status={club.verification_status} /></div>
      <p className="mt-6 whitespace-pre-wrap leading-7 text-[var(--ink-soft)]">{club.description}</p>
      {(club.public_email || club.public_website) ? <section className="mt-6 border-t border-[var(--border)] pt-5"><h2 className="font-bold text-[var(--ink)]">Contact</h2><div className="mt-2 flex flex-wrap gap-4 text-sm">{club.public_email ? <a href={`mailto:${club.public_email}`} className="font-semibold text-[var(--maroon)] hover:underline">Email club</a> : null}{club.public_website ? <a href={club.public_website} target="_blank" rel="noreferrer" className="font-semibold text-[var(--maroon)] hover:underline">Official website ↗</a> : null}</div></section> : null}
      {representative && club.verification_status !== "verified" ? <ActionForm action={requestClubVerification} className="mt-6 space-y-2"><input type="hidden" name="clubId" value={club.id} /><input type="hidden" name="slug" value={club.slug} />{club.verification_status === "rejected" && club.verification_reason ? <p className="text-sm text-[var(--danger)]">Previous decision: {club.verification_reason}</p> : null}<button className="rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white">Request verification</button></ActionForm> : null}
    </header>
    <section className="mt-10"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-bold text-[var(--ink)]">Announcements</h2><p className="mt-1 text-sm text-[var(--ink-soft)]">Updates published by this club.</p></div>{canManage && club.verification_status === "verified" ? <Link href={`/clubs/${club.slug}/announcements/new`} className="rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white">New announcement</Link> : null}</div>
      {announcements.length ? <div className="mt-5 space-y-4">{announcements.filter((item) => canManage || item.status === "published").map((item) => <article key={item.id} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-[var(--ink)]"><Link href={`/clubs/${club.slug}/announcements/${item.id}`} className="hover:underline">{item.title}</Link></h3>{item.status !== "published" ? <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-900">{item.status}</span> : null}</div><p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--ink-soft)]">{item.body}</p></article>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-[var(--ink-soft)]">No announcements yet.</div>}
    </section>
  </>;
}
