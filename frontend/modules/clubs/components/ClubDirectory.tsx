import Link from "next/link";
import { CLUB_PAGE_SIZE, clubDirectoryUrl, type ClubDirectorySearch } from "../search";
import type { ClubSummary } from "../types";

export function VerificationBadge({ status }: { status: ClubSummary["verification_status"] }) {
  if (status === "verified") return <span aria-label="Verification status: verified" className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">✓ Verified club</span>;
  return <span aria-label={`Verification status: ${status}`} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === "pending" ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-700"}`}>{status === "pending" ? "Verification pending" : status === "rejected" ? "Verification declined" : "Not verified"}</span>;
}

export function ClubDirectory({ clubs, total, hasNext, categories, search }: {
  clubs: ClubSummary[]; total: number; hasNext: boolean; categories: string[]; search: ClubDirectorySearch;
}) {
  return <>
    <form action="/clubs" className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:grid-cols-[1fr_14rem_auto] sm:items-end" role="search" aria-label="Find a club">
      <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--ink)]" htmlFor="club-search">Search clubs
      <input id="club-search" name="q" type="search" defaultValue={search.q} placeholder="Name or description" className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]" /></label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--ink)]" htmlFor="club-category">Club category
      <select id="club-category" name="category" defaultValue={search.category} className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">
        <option value="">All categories</option>
        {categories.map((category) => <option key={category}>{category}</option>)}
      </select></label>
      <button className="min-h-11 rounded-lg bg-[var(--maroon)] px-5 py-2 font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">Search</button>
    </form>
    <p className="my-5 text-sm text-[var(--ink-soft)]" aria-live="polite">{total} club{total === 1 ? "" : "s"} found</p>
    {clubs.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {clubs.map((club) => <article key={club.id} className="flex min-h-64 flex-col rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
        <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-[var(--maroon)]">{club.category}</p><VerificationBadge status={club.verification_status} /></div>
        <h2 className="mt-3 text-xl font-bold text-[var(--ink)]"><Link href={`/clubs/${club.slug}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">{club.name}</Link></h2>
        <p className="mt-3 line-clamp-4 flex-1 text-sm leading-6 text-[var(--ink-soft)]">{club.description}</p>
        <Link href={`/clubs/${club.slug}`} aria-label={`View ${club.name}`} className="mt-5 min-h-10 self-start rounded-lg py-2 font-semibold text-[var(--maroon)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">View club →</Link>
      </article>)}
    </div> : <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-10 text-center"><h2 className="text-xl font-bold text-[var(--ink)]">No clubs match these filters</h2><p className="mt-2 text-[var(--ink-soft)]">Try another search or clear the category.</p><Link href="/clubs" className="mt-4 inline-block font-semibold text-[var(--maroon)] hover:underline">Clear filters</Link></div>}
    <nav aria-label="Club directory pages" className="mt-8 grid grid-cols-2 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
      {search.page > 1 ? <Link href={clubDirectoryUrl({ ...search, page: search.page - 1 })} className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 font-semibold text-[var(--maroon)]">← Previous</Link> : <span />}
      <span className="col-span-2 row-start-1 text-center text-sm text-[var(--ink-soft)] sm:col-span-1 sm:col-start-2">Page {search.page} · up to {CLUB_PAGE_SIZE} per page</span>
      {hasNext ? <Link href={clubDirectoryUrl({ ...search, page: search.page + 1 })} className="justify-self-end rounded-lg border border-[var(--border)] bg-white px-4 py-2 font-semibold text-[var(--maroon)]">Next →</Link> : <span />}
    </nav>
  </>;
}
