import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import {
  ArchiveControl,
  CommunityPostCard,
  formatDate,
  getCommunityBySlug,
  getMembership,
  isModeratorOrAdmin,
  JoinToPostButton,
  listCommunityPosts,
  MAX_PAGES,
  MembershipControls,
  parsePages,
  plural,
  TopicBadge,
} from "@/modules/communities";
import { getProfile } from "@/modules/profiles";

type CommunityPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pages?: string | string[] }>;
};

export async function generateMetadata({ params }: CommunityPageProps): Promise<Metadata> {
  const community = await getCommunityBySlug((await params).slug);
  return { title: `${community?.name ?? "Community"} · CampusConnect` };
}

const BUTTON_LINK =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

export default async function CommunityPage({ params, searchParams }: CommunityPageProps) {
  const user = await requireUser();
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();

  const pages = parsePages((await searchParams).pages);
  const isOwner = community.ownerId === user.id;
  const [membership, staff, owner, { posts, hasMore }] = await Promise.all([
    getMembership(community.id, user.id),
    isModeratorOrAdmin(),
    isOwner ? null : getProfile(community.ownerId).catch(() => null),
    listCommunityPosts(community.id, pages),
  ]);

  const active = community.status === "active";
  const isMember = membership.role !== null;
  const courseHref = community.courseCode
    ? `/courses/${encodeURIComponent(community.courseCode.replace(/ /g, "-"))}`
    : null;

  return (
    <AppShell>
      <main className="flex-1 px-4 py-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <Link href="/communities" className="text-sm font-medium text-[var(--maroon)] hover:underline">
            ← Communities
          </Link>

          <header className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <TopicBadge community={community} />
              {courseHref ? (
                <Link href={courseHref} className="font-medium text-[var(--maroon)] hover:underline">
                  {community.courseCode} · {community.courseName}
                </Link>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold text-[var(--ink)] sm:text-3xl">{community.name}</h1>
            {community.description ? (
              <p className="whitespace-pre-wrap break-words text-[var(--ink-soft)]">{community.description}</p>
            ) : null}
            <p className="text-sm text-[var(--ink-soft)]">
              {plural(community.memberCount, "member")} · {plural(community.followerCount, "follower")} · Started by{" "}
              {isOwner ? (
                "you"
              ) : owner ? (
                <Link href={`/profile/${owner.id}`} className="font-medium text-[var(--maroon)] hover:underline">
                  {owner.fullName}
                </Link>
              ) : (
                "a CampusConnect student"
              )}
            </p>

            {!active ? (
              <p role="note" className="rounded-lg border border-[var(--border)] bg-[var(--maroon-50)] px-3 py-2 text-sm text-[var(--ink)]">
                <strong>Archived</strong>
                {community.archivedAt ? ` on ${formatDate(community.archivedAt)}` : ""}. Its posts stay readable, but it takes no new members or posts.
              </p>
            ) : (
              <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
                <MembershipControls communityId={community.id} slug={community.slug} name={community.name} membership={membership} />
                {isOwner || staff ? (
                  <div className="flex flex-wrap items-start gap-2">
                    {isOwner ? (
                      <Link
                        href={`/communities/${community.slug}/edit`}
                        className={`${BUTTON_LINK} border border-[var(--border)] bg-white text-[var(--ink)] hover:bg-[var(--maroon-50)]`}
                      >
                        Edit details
                      </Link>
                    ) : null}
                    <ArchiveControl communityId={community.id} slug={community.slug} name={community.name} />
                  </div>
                ) : null}
              </div>
            )}
          </header>

          <section aria-labelledby="community-posts" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="community-posts" className="text-lg font-semibold text-[var(--ink)]">
                Posts
              </h2>
              {active && isMember ? (
                <Link href={`/communities/${community.slug}/new`} className={`${BUTTON_LINK} bg-[var(--maroon)] text-white hover:bg-[var(--maroon-dark)]`}>
                  New post
                </Link>
              ) : active ? (
                <JoinToPostButton communityId={community.id} slug={community.slug} />
              ) : null}
            </div>

            {posts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--ink-soft)]">
                No posts yet.{active && isMember ? " Write the first one." : ""}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {posts.map((post) => (
                  <li key={post.id}>
                    <CommunityPostCard post={post} />
                  </li>
                ))}
              </ul>
            )}

            {hasMore && pages < MAX_PAGES ? (
              <Link
                href={`/communities/${community.slug}?pages=${pages + 1}`}
                scroll={false}
                className={`${BUTTON_LINK} self-center border border-[var(--border)] bg-white text-[var(--ink)] hover:bg-[var(--maroon-50)]`}
              >
                Load more
              </Link>
            ) : null}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
