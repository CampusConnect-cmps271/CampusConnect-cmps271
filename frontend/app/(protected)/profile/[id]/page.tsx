import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { MessageButton } from "@/modules/messaging";
import { getPinnedPost, getProfile, PinnedPostCard, ProfileView } from "@/modules/profiles";

type StudentProfilePageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: StudentProfilePageProps): Promise<Metadata> {
  await requireUser();
  const { id } = await params;
  const profile = await getProfile(id);
  return { title: profile ? `${profile.fullName} · CampusConnect` : "Profile · CampusConnect" };
}

export default async function StudentProfilePage({ params }: StudentProfilePageProps) {
  const user = await requireUser();
  const { id } = await params;
  if (id.toLowerCase() === user.id) redirect("/profile");
  const profile = await getProfile(id);
  if (!profile) notFound();
  const pinnedPost = await getPinnedPost(profile);

  return (
    <AppShell>
      <main id="main-content" className="min-w-0 flex-1 bg-[var(--maroon-50)] px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5 sm:gap-6">
          <nav aria-label="Profile navigation" className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/home" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--maroon)] hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">
              <span aria-hidden="true" className="mr-2">←</span> Back to feed
            </Link>
            <MessageButton studentId={profile.id} studentName={profile.fullName} />
          </nav>
          <ProfileView profile={profile} />
          {pinnedPost ? <PinnedPostCard post={pinnedPost} /> : null}
        </div>
      </main>
    </AppShell>
  );
}
