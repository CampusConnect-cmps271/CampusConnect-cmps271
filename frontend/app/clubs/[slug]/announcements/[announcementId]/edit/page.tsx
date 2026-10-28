import Link from "next/link";
import { notFound } from "next/navigation";
import { getClubAccess, getClubAnnouncement, getClubBySlug } from "@/modules/clubs";
import { AnnouncementForm } from "@/modules/clubs/components/AnnouncementForm";

export default async function EditAnnouncementPage({ params }: { params: Promise<{ slug: string; announcementId: string }> }) {
  const { slug, announcementId } = await params; const club = await getClubBySlug(slug); if (!club) notFound();
  const [announcement, access] = await Promise.all([getClubAnnouncement(club.id, announcementId), getClubAccess(club.id)]);
  if (!announcement || !access.canManage || announcement.status === "removed" || club.verification_status !== "verified") notFound();
  return <main className="mx-auto max-w-3xl px-4 py-10"><Link href={`/clubs/${slug}/announcements/${announcementId}`} className="text-sm font-semibold text-[var(--maroon)]">← Announcement</Link><h1 className="my-7 text-3xl font-bold">Edit announcement</h1><AnnouncementForm club={club} announcement={announcement} /></main>;
}
