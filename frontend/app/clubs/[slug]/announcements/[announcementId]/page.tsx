import Link from "next/link";
import { notFound } from "next/navigation";
import { getClubAccess, getClubAnnouncement, getClubBySlug } from "@/modules/clubs";
import { removeClubAnnouncement } from "@/modules/clubs/actions";
import { ActionForm } from "@/modules/clubs/components/ActionForm";

export default async function AnnouncementPage({ params }: { params: Promise<{ slug: string; announcementId: string }> }) {
  const { slug, announcementId } = await params; const club = await getClubBySlug(slug); if (!club) notFound();
  const [announcement, access] = await Promise.all([getClubAnnouncement(club.id, announcementId), getClubAccess(club.id)]);
  if (!announcement || (announcement.status !== "published" && !access.canManage)) notFound();
  return <main className="mx-auto max-w-3xl px-4 py-10"><Link href={`/clubs/${slug}`} className="text-sm font-semibold text-[var(--maroon)]">← {club.name}</Link><article className="mt-6 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap justify-between gap-3"><h1 className="text-3xl font-bold text-[var(--ink)]">{announcement.title}</h1>{announcement.status !== "published" ? <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-900">{announcement.status}</span> : null}</div><p className="mt-6 whitespace-pre-wrap leading-7 text-[var(--ink-soft)]">{announcement.body}</p>{access.canManage ? <div className="mt-8 flex flex-wrap items-start gap-3 border-t border-[var(--border)] pt-5"><Link href={`/clubs/${slug}/announcements/${announcement.id}/edit`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--maroon)]">Edit</Link><ActionForm action={removeClubAnnouncement} className="space-y-2"><input type="hidden" name="clubId" value={club.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="announcementId" value={announcement.id} /><button className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-[var(--danger)]">Remove</button></ActionForm></div> : null}</article></main>;
}
