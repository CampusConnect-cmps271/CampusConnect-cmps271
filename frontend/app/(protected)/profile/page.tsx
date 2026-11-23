import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import Link from "next/link";
import RoleGate from "@/components/role-gate";
import { getMyProfile, getPinnedPost, PinnedPostCard, ProfileCard } from "@/modules/profiles";

export const metadata: Metadata = { title: "My profile · CampusConnect" };

const linkClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

export default async function ProfilePage() {
  const profile = await getMyProfile();
  const pinnedPost = profile ? await getPinnedPost(profile) : null;

  return (
    <AppShell>
      <main id="main-content" className="min-w-0 flex-1 bg-[var(--maroon-50)] px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5 sm:gap-6">
          <nav aria-label="Profile navigation" className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/home" className={`${linkClass} text-[var(--maroon)]`}>
              <span aria-hidden="true" className="mr-2">←</span> Back to feed
            </Link>
            <div className="flex flex-wrap gap-2">
              <RoleGate allow={["administrator"]}>
                <Link href="/admin" className={linkClass}>Manage user roles</Link>
              </RoleGate>
              <RoleGate allow={["moderator", "administrator"]}>
                <Link href="/moderation" className={linkClass}>Moderation queue</Link>
              </RoleGate>
            </div>
          </nav>

          {profile ? (
            <>
              <ProfileCard profile={profile} />
              <section aria-labelledby="profile-activity-heading" className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="profile-activity-heading" className="text-lg font-bold text-[var(--ink)]">Your activity</h2>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">Find your saved posts and get back to the community.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/saved" className={linkClass}>Saved posts</Link>
                    <Link href="/home" className={linkClass}>Community feed</Link>
                  </div>
                </div>
              </section>
              {pinnedPost ? (
                <PinnedPostCard post={pinnedPost} />
              ) : (
                <section aria-labelledby="empty-pin-heading" className="rounded-xl border border-dashed border-[var(--border)] bg-white p-5 sm:p-6">
                  <h2 id="empty-pin-heading" className="font-semibold text-[var(--ink)]">No pinned post yet</h2>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">Pin one of your posts to highlight it here.</p>
                  <Link href="/home" className="mt-3 inline-flex min-h-11 items-center font-semibold text-[var(--maroon)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">Browse community posts</Link>
                </section>
              )}
            </>
          ) : (
            <section role="alert" className="rounded-xl border border-[var(--border)] bg-white p-6">
              <h1 className="text-xl font-bold text-[var(--ink)]">Your profile is unavailable</h1>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">We couldn’t load your profile. Try refreshing this page.</p>
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}
