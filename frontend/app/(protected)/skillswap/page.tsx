import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import {
  boardHref,
  listSkillSwapPosts,
  parseBoardSearch,
  SEARCH_TERM_LENGTH,
  SkillSwapCardView,
} from "@/modules/skillswap";

export const metadata: Metadata = {
  title: "SkillSwap · CampusConnect",
};

type SkillSwapBoardProps = {
  searchParams: Promise<{ q?: string | string[]; in?: string | string[]; page?: string | string[] }>;
};

export default async function SkillSwapBoardPage({ searchParams }: SkillSwapBoardProps) {
  await requireUser();
  const search = parseBoardSearch(await searchParams);
  const { cards, hasMore } = await listSkillSwapPosts(search);
  const searching = search.q !== "";

  return (
    <AppShell>
<main className="flex-1 px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ink)]">SkillSwap</h1>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Find a student who can teach what you want to learn, and offer something back.
            </p>
          </div>
          <Link
            href="/skillswap/new"
            className="rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
          >
            Offer a skill swap
          </Link>
        </div>

        <form
          action="/skillswap"
          role="search"
          aria-label="Search skill swaps"
          className="flex flex-col gap-3 rounded-lg bg-white p-4 text-[var(--ink)] border border-[var(--border)]"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="skillswap-q" className="sr-only">
              Search
            </label>
            <input
              id="skillswap-q"
              name="q"
              type="search"
              defaultValue={search.q}
              maxLength={SEARCH_TERM_LENGTH}
              placeholder="A skill, e.g. Python, French, guitar"
              className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)]"
            >
              Search
            </button>
          </div>

          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <legend className="sr-only">Search in</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="in"
                value="teach"
                defaultChecked={search.field === "teach"}
                className="accent-[var(--maroon)]"
              />
              Who can teach
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="in"
                value="learn"
                defaultChecked={search.field === "learn"}
                className="accent-[var(--maroon)]"
              />
              Who wants to learn
            </label>
          </fieldset>
        </form>

        {searching ? (
          <p className="text-sm text-[var(--ink-soft)]" role="status">
            {cards.length === 0 ? "No" : hasMore ? `More than ${cards.length}` : cards.length} skill
            swap{cards.length === 1 && !hasMore ? "" : "s"} where someone{" "}
            {search.field === "learn" ? "wants to learn" : "can teach"} “{search.q}”.{" "}
            <Link href="/skillswap" className="font-medium text-[var(--maroon)] hover:underline">
              Clear search
            </Link>
          </p>
        ) : null}

        {cards.length === 0 ? (
          <div className="rounded-lg bg-white p-6 text-center text-[var(--ink-soft)] border border-[var(--border)]">
            {searching ? (
              <p>
                Try a broader word, or{" "}
                <Link href="/skillswap/new" className="font-medium text-[var(--maroon)] hover:underline">
                  post what you&apos;re looking for
                </Link>{" "}
                so the right person can find you.
              </p>
            ) : (
              <p>
                No skill swaps yet.{" "}
                <Link href="/skillswap/new" className="font-medium text-[var(--maroon)] hover:underline">
                  Post the first one
                </Link>
                : say what you can teach and what you want to learn.
              </p>
            )}
          </div>
        ) : (
          <ul aria-label="Skill swaps" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <li key={card.postId}>
                <SkillSwapCardView card={card} />
              </li>
            ))}
          </ul>
        )}

        {hasMore ? (
          <Link
            href={boardHref({ ...search, page: search.page + 1 })}
            scroll={false}
            className="self-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--maroon-50)]"
          >
            Load more
          </Link>
        ) : null}
      </div>
    </main>
</AppShell>
  );
}
