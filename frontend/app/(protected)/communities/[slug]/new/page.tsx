import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import {
  ARCHIVED_MESSAGE,
  CommunityPostForm,
  createCommunityPost,
  getCommunityBySlug,
  getMembership,
  MembershipControls,
} from "@/modules/communities";

type NewCommunityPostPageProps = {
  params: Promise<{ slug: string }>;
};

export const metadata: Metadata = {
  title: "New community post · CampusConnect",
};

export default async function NewCommunityPostPage({ params }: NewCommunityPostPageProps) {
  const user = await requireUser();
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();

  const membership = await getMembership(community.id, user.id);
  const active = community.status === "active";
  const back = `/communities/${community.slug}`;

  return (
    <AppShell>
      <main className="flex-1 px-4 py-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <Link href={back} className="text-sm font-medium text-[var(--maroon)] hover:underline">
            ← {community.name}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ink)]">New post in {community.name}</h1>

          {!active ? (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--maroon-50)] px-3 py-2 text-sm text-[var(--ink)]">
              {ARCHIVED_MESSAGE}
            </p>
          ) : membership.role === null ? (
            <section aria-labelledby="join-to-post" className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-5">
              <h2 id="join-to-post" className="text-base font-semibold text-[var(--ink)]">
                Join to post
              </h2>
              <p className="text-sm text-[var(--ink-soft)]">Only members can post in {community.name}.</p>
              <MembershipControls communityId={community.id} slug={community.slug} name={community.name} membership={membership} />
            </section>
          ) : (
            <CommunityPostForm action={createCommunityPost.bind(null, community.id, community.slug)} cancelHref={back} />
          )}
        </div>
      </main>
    </AppShell>
  );
}
