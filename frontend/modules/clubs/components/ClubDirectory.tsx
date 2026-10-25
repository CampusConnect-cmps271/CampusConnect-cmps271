import Link from "next/link";
import { CLUB_PAGE_SIZE, clubDirectoryUrl, type ClubDirectorySearch } from "../search";
import type { ClubSummary } from "../types";

export function VerificationBadge({ status }: { status: ClubSummary["verification_status"] }) {
  if (status === "verified") return <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">✓ Verified club</span>;
  return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{status === "pending" ? "Verification pending" : "Not verified"}</span>;
}

export function ClubDirectory({ clubs, total, hasNext, categories, search }: {
  clubs: ClubSummary[]; total: number; hasNext: boolean; categories: string[]; search: ClubDirectorySearch;
}) {
  return <>
    <form action="/clubs" className="grid gap-3 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm sm:grid-cols-[1fr_14rem_auto]" role="search">
      <label className="sr-only" htmlFor="club-search">Search clubs</label>
      <input id="club-search" name="q" defaultValue={search.q} placeholder="Search club names or descriptions" className="rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--ink)]" />
      <label className="sr-only" htmlFor="club-category">Club category</label>
      <select id="club-category" name="category" defaultValue={search.category} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[var(--ink)]">
        <option value="">All categories</option>
        {categories.map((category) => <option key={category}>{category}</option>)}
      </select>
      <button className="rounded-lg bg-[var(--maroon)] px-5 py-2 font-semibold text-white">Search</button>
    </form>
    <p className="my-5 text-sm text-[var(--ink-soft)]" aria-live="polite">{total} club{total === 1 ? "" : "s"} found</p>
    {clubs.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {clubs.map((club) => <article key={club.id} className="flex min-h-64 flex-col rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-[var(--maroon)]">{club.category}</p><VerificationBadge status={club.verification_status} /></div>
        <h2 className="mt-3 text-xl font-bold text-[var(--ink)]"><Link href={`/clubs/${club.slug}`} className="hover:underline">{club.name}</Link></h2>
        <p className="mt-3 line-clamp-4 flex-1 text-sm leading-6 text-[var(--ink-soft)]">{club.description}</p>
        <Link href={`/clubs/${club.slug}`} className="mt-5 font-semibold text-[var(--maroon)] hover:underline">View club →</Link>
      </article>)}
    </div> : <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-10 text-center"><h2 className="text-xl font-bold text-[var(--ink)]">No clubs match these filters</h2><p className="mt-2 text-[var(--ink-soft)]">Try another search or clear the category.</p><Link href="/clubs" className="mt-4 inline-block font-semibold text-[var(--maroon)] hover:underline">Clear filters</Link></div>}
    <nav aria-label="Club directory pages" className="mt-8 flex items-center justify-between">
      {search.page > 1 ? <Link href={clubDirectoryUrl({ ...search, page: search.page - 1 })} className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 font-semibold text-[var(--maroon)]">← Previous</Link> : <span />}
      <span className="text-sm text-[var(--ink-soft)]">Page {search.page} · up to {CLUB_PAGE_SIZE} per page</span>
      {hasNext ? <Link href={clubDirectoryUrl({ ...search, page: search.page + 1 })} className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 font-semibold text-[var(--maroon)]">Next →</Link> : <span />}
    </nav>
  </>;
}
