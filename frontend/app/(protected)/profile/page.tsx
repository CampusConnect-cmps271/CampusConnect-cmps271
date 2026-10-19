import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import Link from "next/link";
import RoleGate from "@/components/role-gate";
import {
  getMyProfile,
  getPinnedPost,
  PinnedPostCard,
  ProfileCard,
} from "@/modules/profiles";

export const metadata: Metadata = {
  title: "Profile · CampusConnect",
};

export default async function ProfilePage() {
  const profile = await getMyProfile();
  const pinnedPost = profile ? await getPinnedPost(profile) : null;

  return (
    <AppShell>
<main className="flex-1 bg-white px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/home" className="text-sm font-medium text-[var(--maroon)] hover:underline">
            ← Back to feed
          </Link>

          <RoleGate allow={["administrator"]}>
            <Link
              href="/admin"
              className="rounded-md bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)]"
            >
              Manage user roles
            </Link>
          </RoleGate>

          <RoleGate allow={["moderator", "administrator"]}>
            <Link
              href="/moderation"
              className="rounded-md border border-[var(--maroon)] px-4 py-2 text-sm font-semibold text-[var(--maroon)] hover:bg-[var(--maroon-50)]"
            >
              Moderation queue
            </Link>
          </RoleGate>
        </div>

        {pinnedPost ? <PinnedPostCard post={pinnedPost} /> : null}

        {profile ? (
          <ProfileCard profile={profile} />
        ) : (
          <p role="alert" className="rounded-lg bg-white p-6 text-[var(--ink)] border border-[var(--border)]">
            Your profile isn&apos;t ready yet. Please try again in a moment.
          </p>
        )}
      </div>
    </main>
</AppShell>
  );
}
