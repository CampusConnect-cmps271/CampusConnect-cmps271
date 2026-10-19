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
    <main className="flex-1 bg-gray-100 px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/home" className="text-sm font-medium text-blue-700 hover:underline">
            ← Back to feed
          </Link>

          <RoleGate allow={["administrator"]}>
            <Link
              href="/admin"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Manage user roles
            </Link>
          </RoleGate>

          <RoleGate allow={["moderator", "administrator"]}>
            <Link
              href="/moderation"
              className="rounded-md border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Moderation queue
            </Link>
          </RoleGate>
        </div>

        {pinnedPost ? <PinnedPostCard post={pinnedPost} /> : null}

        {profile ? (
          <ProfileCard profile={profile} />
        ) : (
          <p role="alert" className="rounded-lg bg-white p-6 text-gray-800 shadow-md">
            Your profile isn&apos;t ready yet. Please try again in a moment.
          </p>
        )}
      </div>
    </main>
  );
}
