import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import {
  COMMUNITY_TOPICS,
  communitiesHref,
  CommunityCard,
  CommunityPostCard,
  discoverCommunities,
  findCourseByCode,
  isDirectorySearched,
  listAllCommunityPosts,
  listFollowingFeed,
  listMyCommunities,
  listSuggestions,
  MAX_PAGES,
  parseDirectorySearch,
  parsePages,
  parsePostFeed,
  TOPIC_LABELS,
  WritePostPicker,
  type CommunitiesView,
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
const TAB = `rounded-md px-3 py-1.5 text-sm font-semibold ${FOCUS}`;

export default async function CommunitiesPage({ searchParams }: CommunitiesPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const view: CommunitiesView = {
    search: parseDirectorySearch(params),
    searched: isDirectorySearched(params),
    posts: parsePostFeed(params.posts),
    feed: parsePages(params.feed),
  };
  const { search } = view;

  const [mine, feed, discovered, suggestions] = await Promise.all([
    listMyCommunities(user.id),
    view.posts === "all" ? listAllCommunityPosts(view.feed) : listFollowingFeed(user.id, view.feed),
    view.searched ? discoverCommunities(search) : null,
    listSuggestions(user.id),
  ]);
  // A search for a course code that finds nothing invites the student to start its first community.
  const inviteCourse = discovered?.communities.length === 0 && search.q ? await findCourseByCode(search.q) : null;
  const filtered = Boolean(search.q || search.topic);
  // The post picker offers the active communities the student can post in.
  const postable = mine
    .filter(({ community, membership }) => membership.role !== null && community.status === "active")
    .map(({ community }) => ({ slug: community.slug, name: community.name }));

  return (
    <AppShell>
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
          <section id="find" aria-labelledby="communities-heading" className="flex scroll-mt-24 flex-col gap-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h1 id="communities-heading" className="text-2xl font-bold text-[var(--ink)] sm:text-3xl">
                Communities
              </h1>
              <Link
                href="/communities/new"
                className={`inline-flex items-center justify-center rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] ${FOCUS}`}
              >
                Start a community
              </Link>
            </header>

            <form action="/communities#find" role="search" aria-label="Communities" className="flex flex-wrap items-end gap-3">
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
              {/* The open feed stays as it is while searching. */}
              {view.posts === "all" ? <input type="hidden" name="posts" value="all" /> : null}
              <button
                type="submit"
                className={`rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] ${FOCUS}`}
              >
                Search
              </button>
              {view.searched ? (
                <Link
                  href={communitiesHref(view, { searched: false }, "find")}
                  className="py-2 text-sm font-medium text-[var(--maroon)] hover:underline"
                >
                  Clear
                </Link>
              ) : (
                <Link
                  href={communitiesHref({ ...view, search: parseDirectorySearch({}) }, { searched: true }, "find")}
                  className="py-2 text-sm font-medium text-[var(--maroon)] hover:underline"
                >
                  Browse all
                </Link>
              )}
            </form>

            {discovered === null ? null : discovered.communities.length === 0 ? (
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
            {discovered?.hasMore && search.pages < MAX_PAGES ? (
              <Link href={communitiesHref(view, { pages: search.pages + 1 }, "find")} scroll={false} className={`${LINK_BUTTON} self-center`}>
                Load more
              </Link>
            ) : null}
          </section>

          <section aria-labelledby="your-communities" className="flex flex-col gap-3">
            <h2 id="your-communities" className={HEADING}>
              Your communities
            </h2>
            {mine.length === 0 ? (
              <p className={EMPTY}>You haven&apos;t joined or followed a community yet. Search for one above, or start your own.</p>
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

          <section id="posts" aria-labelledby="posts-heading" className="flex max-w-3xl scroll-mt-24 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="posts-heading" className={HEADING}>
                Posts
              </h2>
              <nav aria-label="Show posts from" className="flex gap-1 rounded-lg border border-[var(--border)] bg-white p-1">
                {(
                  [
                    ["following", "Following"],
                    ["all", "All communities"],
                  ] as const
                ).map(([value, label]) => (
                  <Link
                    key={value}
                    href={communitiesHref(view, { posts: value, feed: 1 }, "posts")}
                    scroll={false}
                    aria-current={view.posts === value ? "page" : undefined}
                    className={`${TAB} ${
                      view.posts === value ? "bg-[var(--maroon)] text-white" : "text-[var(--ink)] hover:bg-[var(--maroon-50)]"
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <WritePostPicker communities={postable} />

            {feed.posts.length === 0 ? (
              <p className={EMPTY}>
                {view.posts === "all"
                  ? "No community posts yet."
                  : mine.some(({ membership }) => membership.following)
                    ? "No posts yet in the communities you follow."
                    : "Follow a community to see its newest posts here."}
              </p>
            ) : (
              <ul aria-label={view.posts === "all" ? "Posts from all communities" : "Posts from communities you follow"} className="flex flex-col gap-3">
                {feed.posts.map((post) => (
                  <li key={post.id}>
                    <CommunityPostCard post={post} />
                  </li>
                ))}
              </ul>
            )}
            {feed.hasMore && view.feed < MAX_PAGES ? (
              <Link href={communitiesHref(view, { feed: view.feed + 1 }, "posts")} scroll={false} className={`${LINK_BUTTON} self-start`}>
                Load more
              </Link>
            ) : null}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
