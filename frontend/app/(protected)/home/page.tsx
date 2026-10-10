
import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton, requireUser } from "@/modules/auth";
import { getFeedPosts, POSTS_PER_PAGE } from "@/modules/posts/feed";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Home · CampusConnect",
};

type HomePageProps = {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    category?: string;
  }>;
};

export default async function HomePage({
  searchParams,
}: HomePageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const page = Math.max(
    1,
    Math.min(100, Number.parseInt(params.page ?? "1", 10) || 1)
  );

  const sort = params.sort === "top" ? "top" : "newest";
  const category = params.category ?? "";

  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("name")
    .order("id", { ascending: true });

  const validCategories = categories?.map((item) => item.name) ?? [];
  const selectedCategory = validCategories.includes(category)
    ? category
    : "";

  const { posts, hasMore } = await getFeedPosts(
    page,
    sort,
    selectedCategory || undefined
  );

  function feedUrl(
    nextPage: number,
    nextSort = sort,
    nextCategory = selectedCategory
  ) {
    const params = new URLSearchParams();

    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextSort !== "newest") params.set("sort", nextSort);
    if (nextCategory) params.set("category", nextCategory);

    const query = params.toString();
    return query ? `/home?${query}` : "/home";
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome, {user.name}
          </h1>

          {user.email && (
            <p className="text-sm opacity-80">
              Signed in as {user.email}
            </p>
          )}
        </div>

        <LogoutButton />
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">
            Campus Feed
          </h2>

          <Link
            href="/posts/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            New post
          </Link>
        </div>

        <div className="flex flex-wrap gap-3">
          <form action="/home" className="flex flex-wrap gap-3">
            <label className="sr-only" htmlFor="category">
              Filter by category
            </label>

            <select
              id="category"
              name="category"
              defaultValue={selectedCategory}
              className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
            >
              <option value="">All categories</option>
              {validCategories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="sort">
              Sort posts
            </label>

            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
            >
              <option value="newest">Newest</option>
              <option value="top">Top (coming soon)</option>
            </select>

            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Apply
            </button>
          </form>
        </div>
      </section>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-gray-700 p-8 text-center">
          <p className="text-gray-400">
            No posts found.
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-xl border border-gray-700 p-5"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-400">
                  {post.category}
                </span>

                <time className="text-xs text-gray-400">
                  {new Date(post.created_at).toLocaleDateString()}
                </time>
              </div>

              <Link href={`/posts/${post.id}`}>
                <h3 className="mb-2 text-lg font-semibold hover:underline">
                  {post.title}
                </h3>
              </Link>

              <p className="line-clamp-3 whitespace-pre-wrap text-sm opacity-80">
                {post.body}
              </p>

              <div className="mt-4 flex gap-4 text-xs text-gray-400">
                <span>{post.upvote_count} upvotes</span>
                <span>{post.comment_count} comments</span>
              </div>
            </article>
          ))}
        </section>
      )}

      <nav className="flex items-center justify-between gap-4">
        {page > 1 ? (
          <Link
            href={feedUrl(page - 1)}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm"
          >
            Previous
          </Link>
        ) : (
          <span />
        )}

        <span className="text-sm opacity-70">
          Page {page}
        </span>

        {hasMore && (
          <Link
            href={feedUrl(page + 1)}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm"
          >
            Load more
          </Link>
        )}
      </nav>

      <p className="text-xs opacity-60">
        Showing up to {POSTS_PER_PAGE} posts per page.
      </p>
    </main>
  );
}
