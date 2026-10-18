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
    <main className="flex-1 bg-gray-100 px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SkillSwap</h1>
            <p className="mt-1 text-sm text-gray-700">
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
          className="flex flex-col gap-3 rounded-lg bg-white p-4 text-gray-900 shadow-md"
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
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
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
          <p className="text-sm text-gray-700" role="status">
            {cards.length === 0 ? "No" : hasMore ? `More than ${cards.length}` : cards.length} skill
            swap{cards.length === 1 && !hasMore ? "" : "s"} where someone{" "}
            {search.field === "learn" ? "wants to learn" : "can teach"} “{search.q}”.{" "}
            <Link href="/skillswap" className="font-medium text-blue-700 hover:underline">
              Clear search
            </Link>
          </p>
        ) : null}

        {cards.length === 0 ? (
          <div className="rounded-lg bg-white p-6 text-center text-gray-700 shadow-md">
            {searching ? (
              <p>
                Try a broader word, or{" "}
                <Link href="/skillswap/new" className="font-medium text-blue-700 hover:underline">
                  post what you&apos;re looking for
                </Link>{" "}
                so the right person can find you.
              </p>
            ) : (
              <p>
                No skill swaps yet.{" "}
                <Link href="/skillswap/new" className="font-medium text-blue-700 hover:underline">
                  Post the first one
                </Link>
                : say what you can teach and what you want to learn.
              </p>
            )}
          </div>
        ) : (
          <ul aria-label="Skill swaps" className="flex flex-col gap-4">
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
            className="self-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Load more
          </Link>
        ) : null}
      </div>
    </main>
  );
}
