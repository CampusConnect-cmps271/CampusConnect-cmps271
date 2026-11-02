import Link from "next/link";
import { notFound } from "next/navigation";
import { getClubAccess, getClubBySlug } from "@/modules/clubs";
import { AnnouncementForm } from "@/modules/clubs/components/AnnouncementForm";

export default async function NewAnnouncementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const club = await getClubBySlug(slug); if (!club) notFound();
  const access = await getClubAccess(club.id); if (!access.canManage || club.verification_status !== "verified") notFound();
  return <main className="mx-auto max-w-3xl px-4 py-10"><Link href={`/clubs/${slug}`} className="text-sm font-semibold text-[var(--maroon)]">← {club.name}</Link><h1 className="my-7 text-3xl font-bold">New announcement</h1><AnnouncementForm club={club} /></main>;
}
