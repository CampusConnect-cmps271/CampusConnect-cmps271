import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import {
  COMMUNITY_TOPICS,
  CommunityCard,
  CommunityPostCard,
  discoverCommunities,
  findCourseByCode,
  listFollowingFeed,
  listMyCommunities,
  listSuggestions,
  MAX_PAGES,
  parseDirectorySearch,
  parsePages,
  TOPIC_LABELS,
  type DirectorySearch,
} from "@/modules/communities";

export const metadata: Metadata = {
  title: "Communities · CampusConnect",
};

type Param = string | string[] | undefined;

type CommunitiesPageProps = {
  searchParams: Promise<Record<string, Param>>;
};

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";
const FIELD = "rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)]";
const LINK_BUTTON = `inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--maroon-50)] ${FOCUS}`;
const HEADING = "text-lg font-semibold text-[var(--ink)]";
const EMPTY = "rounded-xl border border-dashed border-[var(--border)] bg-white p-5 text-sm text-[var(--ink-soft)]";

/** This page's URL with one list grown by a page, keeping the rest. */
function pageHref(search: DirectorySearch, feedPages: number, changes: { pages?: number; feed?: number }, hash: string) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.topic) params.set("topic", search.topic);
  if (search.sort === "active") params.set("sort", "active");
  const pages = changes.pages ?? search.pages;
  const feed = changes.feed ?? feedPages;
  if (pages > 1) params.set("pages", String(pages));
  if (feed > 1) params.set("feed", String(feed));
  const query = params.toString();
  return `/communities${query ? `?${query}` : ""}#${hash}`;
}

export default async function CommunitiesPage({ searchParams }: CommunitiesPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const search = parseDirectorySearch(params);
  const feedPages = parsePages(params.feed);

  const [mine, following, discovered, suggestions] = await Promise.all([
    listMyCommunities(user.id),
    listFollowingFeed(user.id, feedPages),
    discoverCommunities(search),
    listSuggestions(user.id),
  ]);
  // A search for a course code that finds nothing invites the student to start its first community.
  const inviteCourse = discovered.communities.length === 0 && search.q ? await findCourseByCode(search.q) : null;
  const filtered = Boolean(search.q || search.topic);

  return (
    <AppShell>
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-[var(--ink)] sm:text-3xl">Communities</h1>
            <Link
              href="/communities/new"
              className={`inline-flex items-center justify-center rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] ${FOCUS}`}
            >
              Start a community
            </Link>
          </header>

          <section aria-labelledby="your-communities" className="flex flex-col gap-3">
            <h2 id="your-communities" className={HEADING}>
              Your communities
            </h2>
            {mine.length === 0 ? (
              <p className={EMPTY}>You haven&apos;t joined or followed a community yet. Find one below, or start your own.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mine.map(({ community, membership }) => (
                  <li key={community.id} className="flex [&>article]:flex-1">
                    <CommunityCard community={community} membership={membership} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {suggestions.length > 0 ? (
            <section aria-labelledby="suggested-communities" className="flex flex-col gap-3">
              <h2 id="suggested-communities" className={HEADING}>
                Suggested for you
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map(({ community, reason }) => (
                  <li key={community.id} className="flex [&>article]:flex-1">
                    <CommunityCard community={community} reason={reason} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section id="following" aria-labelledby="following-heading" className="flex scroll-mt-24 flex-col gap-3">
            <h2 id="following-heading" className={HEADING}>
              Following
            </h2>
            {following.posts.length === 0 ? (
              <p className={EMPTY}>
                {mine.some(({ membership }) => membership.following)
                  ? "No posts yet in the communities you follow."
                  : "Follow a community to see its newest posts here."}
              </p>
            ) : (
              <ul className="flex max-w-3xl flex-col gap-3">
                {following.posts.map((post) => (
                  <li key={post.id}>
                    <CommunityPostCard post={post} showCommunity />
                  </li>
                ))}
              </ul>
            )}
            {following.hasMore && feedPages < MAX_PAGES ? (
              <Link href={pageHref(search, feedPages, { feed: feedPages + 1 }, "following")} scroll={false} className={`${LINK_BUTTON} self-start`}>
                Load more
              </Link>
            ) : null}
          </section>

          <section id="discover" aria-labelledby="discover-heading" className="flex scroll-mt-24 flex-col gap-4">
            <h2 id="discover-heading" className={HEADING}>
              Discover
            </h2>
            <form action="/communities#discover" role="search" aria-label="Communities" className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[min(16rem,100%)] flex-1 flex-col gap-1">
                <label htmlFor="community-search" className="text-sm font-semibold text-[var(--ink)]">
                  Search communities
                </label>
                <input
                  id="community-search"
                  name="q"
                  type="search"
                  defaultValue={search.q}
                  maxLength={80}
                  placeholder="Name or description"
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="community-topic" className="text-sm font-semibold text-[var(--ink)]">
                  Topic
                </label>
                <select id="community-topic" name="topic" defaultValue={search.topic ?? ""} className={FIELD}>
                  <option value="">All topics</option>
                  {COMMUNITY_TOPICS.map((topic) => (
                    <option key={topic} value={topic}>
                      {TOPIC_LABELS[topic]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="community-sort" className="text-sm font-semibold text-[var(--ink)]">
                  Sort by
                </label>
                <select id="community-sort" name="sort" defaultValue={search.sort} className={FIELD}>
                  <option value="members">Most members</option>
                  <option value="active">Recent activity</option>
                </select>
              </div>
              <button
                type="submit"
                className={`rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] ${FOCUS}`}
              >
                Search
              </button>
              {filtered ? (
                <Link href="/communities#discover" className="py-2 text-sm font-medium text-[var(--maroon)] hover:underline">
                  Clear
                </Link>
              ) : null}
            </form>

            {discovered.communities.length === 0 ? (
              <div className={EMPTY}>
                {filtered ? (
                  <p>
                    No communities match{search.q ? ` “${search.q}”` : ""}
                    {search.topic ? ` in ${TOPIC_LABELS[search.topic]}` : ""}.{" "}
                    {inviteCourse ? (
                      <Link
                        href={`/communities/new?course=${encodeURIComponent(inviteCourse.code.replace(/ /g, "-"))}`}
                        className="font-semibold text-[var(--maroon)] hover:underline"
                      >
                        Start the first community for {inviteCourse.code}
                      </Link>
                    ) : (
                      <Link href="/communities/new" className="font-semibold text-[var(--maroon)] hover:underline">
                        Start one
                      </Link>
                    )}
                  </p>
                ) : (
                  <p>
                    No communities yet.{" "}
                    <Link href="/communities/new" className="font-semibold text-[var(--maroon)] hover:underline">
                      Start the first one
                    </Link>
                  </p>
                )}
              </div>
            ) : (
              <ul aria-label="Communities found" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {discovered.communities.map((community) => (
                  <li key={community.id} className="flex [&>article]:flex-1">
                    <CommunityCard community={community} />
                  </li>
                ))}
              </ul>
            )}
            {discovered.hasMore && search.pages < MAX_PAGES ? (
              <Link href={pageHref(search, feedPages, { pages: search.pages + 1 }, "discover")} scroll={false} className={`${LINK_BUTTON} self-center`}>
                Load more
              </Link>
            ) : null}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
