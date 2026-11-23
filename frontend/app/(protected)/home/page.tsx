import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts, POSTS_PER_PAGE } from "@/modules/posts/feed";
import { PostSearchForm } from "@/modules/posts/PostSearchForm";

export const metadata: Metadata = { title: "Home · CampusConnect" };

type HomePageProps = {
  searchParams: Promise<{ page?: string; sort?: string; category?: string }>;
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Beirut",
});

export default async function HomePage({ searchParams }: HomePageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Math.min(100, Number.parseInt(params.page ?? "1", 10) || 1));
  const sort = params.sort === "top" ? "top" : "newest";
  const category = params.category ?? "";

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("name")
    .order("id", { ascending: true });
  const validCategories = categories?.map((item) => item.name) ?? [];
  const selectedCategory = validCategories.includes(category) ? category : "";
  const { posts, hasMore } = await getFeedPosts(page, sort, selectedCategory || undefined);

  function feedUrl(nextPage: number, nextSort = sort, nextCategory = selectedCategory) {
    const query = new URLSearchParams();
    if (nextPage > 1) query.set("page", String(nextPage));
    if (nextSort !== "newest") query.set("sort", nextSort);
    if (nextCategory) query.set("category", nextCategory);
    return query.size > 0 ? `/home?${query.toString()}` : "/home";
  }

  const controlClass = "min-h-11 min-w-0 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";
  const outlineLink = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";
  const primaryLink = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

  return (
    <AppShell>
      <main className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-7 px-4 py-7 sm:px-6 sm:py-9 lg:px-10">
        <header className="space-y-1">
          <p className="text-sm font-medium text-[var(--maroon)]">CampusConnect</p>
          <h1 className="break-words text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            Welcome, {user.name}
          </h1>
          <p className="text-sm text-[var(--ink-soft)]">Find conversations, updates, and questions from your campus community.</p>
        </header>

        <section aria-labelledby="campus-feed-title" className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 id="campus-feed-title" className="text-xl font-bold text-[var(--ink)] sm:text-2xl">Campus feed</h2>
              <p className="text-sm text-[var(--ink-soft)]">Browse and share what matters on campus.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/saved" className={outlineLink}>Saved posts</Link>
              <Link href="/posts/new" className={primaryLink}>New post</Link>
            </div>
          </div>

          <div className="min-w-0"><PostSearchForm /></div>

          <form action="/home" aria-label="Filter and sort campus posts" className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface,transparent)] p-3 sm:p-4">
            <div className="flex min-w-[150px] flex-1 flex-col gap-1 sm:max-w-xs">
              <label htmlFor="feed-category" className="text-sm font-semibold text-[var(--ink)]">Category</label>
              <select id="feed-category" name="category" defaultValue={selectedCategory} className={controlClass}>
                <option value="">All categories</option>
                {validCategories.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="flex min-w-[130px] flex-1 flex-col gap-1 sm:max-w-xs">
              <label htmlFor="feed-sort" className="text-sm font-semibold text-[var(--ink)]">Sort by</label>
              <select id="feed-sort" name="sort" defaultValue={sort} className={controlClass}>
                <option value="newest">Newest first</option>
                <option value="top">Most upvoted</option>
              </select>
            </div>
            <button type="submit" className={primaryLink}>Apply filters</button>
            {(selectedCategory || sort !== "newest") && <Link href="/home" className={outlineLink}>Clear</Link>}
          </form>
        </section>

        <section aria-label="Campus posts" className="min-w-0">
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] px-5 py-12 text-center sm:px-8">
              <h3 className="text-lg font-bold text-[var(--ink)]">{page > 1 ? "No posts on this page" : "No posts found"}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-soft)]">
                {page > 1 ? "Posts may have changed since your last visit. Return to the first page." : selectedCategory ? "There are no posts in this category yet. Try another category or view all posts." : "There are no posts to show yet. Start a conversation with your campus."}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Link className={outlineLink} href={page > 1 ? feedUrl(1) : "/home"}>{page > 1 ? "Back to first page" : "View all posts"}</Link>
                <Link className={primaryLink} href="/posts/new">Create a post</Link>
              </div>
            </div>
          ) : (
            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => (
                <article key={post.id} className="group flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface,transparent)] p-4 transition-shadow hover:shadow-md sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span className="max-w-full break-words rounded-full bg-[var(--maroon-100)] px-3 py-1 text-xs font-semibold text-[var(--maroon)]">{post.category}</span>
                    <time dateTime={post.created_at} className="text-xs text-[var(--ink-soft)]">{dateFormat.format(new Date(post.created_at))}</time>
                  </div>
                  <h3 className="min-w-0 text-lg font-bold leading-snug text-[var(--ink)]">
                    <Link href={`/posts/${post.id}`} dir="auto" className="block break-words [overflow-wrap:anywhere] hover:text-[var(--maroon)] hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">{post.title}</Link>
                  </h3>
                  <p dir="auto" className="mt-3 line-clamp-4 min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--ink-soft)] [overflow-wrap:anywhere]">{post.body}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border)] pt-4 text-xs text-[var(--ink-soft)]" style={{ marginTop: "auto", paddingTop: "1rem" }}>
                    <span aria-label={`${post.upvote_count} upvotes`}>{post.upvote_count} {post.upvote_count === 1 ? "upvote" : "upvotes"}</span>
                    <span aria-label={`${post.comment_count} comments`}>{post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}</span>
                    {post.edited_at && <span>Edited</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <nav aria-label="Feed pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
          <div>{page > 1 && <Link href={feedUrl(page - 1)} rel="prev" className={outlineLink}>Previous page</Link>}</div>
          <span aria-current="page" className="text-sm font-medium text-[var(--ink-soft)]">Page {page}</span>
          <div>{hasMore && page < 100 && <Link href={feedUrl(page + 1)} rel="next" className={outlineLink}>Next page</Link>}</div>
        </nav>
        <p className="text-xs text-[var(--ink-soft)]">Showing up to {POSTS_PER_PAGE} posts per page.</p>
      </main>
    </AppShell>
  );
}
