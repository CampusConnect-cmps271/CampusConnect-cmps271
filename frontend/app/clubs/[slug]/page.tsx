import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClubAccess, getClubBySlug, listClubAnnouncements } from "@/modules/clubs";
import { ClubProfileView } from "@/modules/clubs/components/ClubProfileView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const club = await getClubBySlug(slug);
  return { title: club ? `${club.name} · CampusConnect` : "Club not found · CampusConnect" };
}

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const club = await getClubBySlug(slug); if (!club) notFound();
  const access = await getClubAccess(club.id);
  const announcements = await listClubAnnouncements(club.id, access.canManage);
  return <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6"><Link href="/clubs" className="text-sm font-semibold text-[var(--maroon)] hover:underline">← Club directory</Link><div className="mt-6"><ClubProfileView club={club} announcements={announcements} canManage={access.canManage} representative={access.membership?.role === "representative"} /></div></main>;
}
