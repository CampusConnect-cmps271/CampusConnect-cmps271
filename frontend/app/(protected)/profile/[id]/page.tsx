import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { MessageButton } from "@/modules/messaging";
import {
  getPinnedPost,
  getProfile,
  PinnedPostCard,
  ProfileView,
} from "@/modules/profiles";

type StudentProfilePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: StudentProfilePageProps): Promise<Metadata> {
  // Metadata can resolve before the layout's check; a signed-out visitor
  // must reach login, not a failed profile read.
  await requireUser();
  const { id } = await params;
  const profile = await getProfile(id);

  return {
    title: profile ? `${profile.fullName} · CampusConnect` : "Profile · CampusConnect",
  };
}

export default async function StudentProfilePage({
  params,
}: StudentProfilePageProps) {
  const user = await requireUser();
  const { id } = await params;

  // Your own profile is the editable one.
  if (id.toLowerCase() === user.id) redirect("/profile");

  const profile = await getProfile(id);
  if (!profile) notFound();

  const pinnedPost = await getPinnedPost(profile);

  return (
    <main className="flex-1 bg-gray-100 px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/home" className="text-sm font-medium text-blue-700 hover:underline">
            ← Back to feed
          </Link>

          <MessageButton studentId={profile.id} studentName={profile.fullName} />
        </div>

        {pinnedPost ? <PinnedPostCard post={pinnedPost} /> : null}

        <ProfileView profile={profile} />
      </div>
    </main>
  );
}
