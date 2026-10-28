import type { Metadata } from "next";
import Link from "next/link";
import { ClubDirectory } from "@/modules/clubs/components/ClubDirectory";
import { listClubCategories, listClubs, readClubSearch } from "@/modules/clubs";

export const metadata: Metadata = { title: "Club directory · CampusConnect" };

export default async function ClubsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = readClubSearch(await searchParams);
  const [{ clubs, total, hasNext }, categories] = await Promise.all([listClubs(search), listClubCategories()]);
  return <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6"><Link href="/home" className="text-sm font-semibold text-[var(--maroon)] hover:underline">← Back to feed</Link><header className="my-7"><h1 className="text-3xl font-bold text-[var(--ink)] sm:text-4xl">Campus clubs</h1><p className="mt-2 max-w-2xl text-[var(--ink-soft)]">Find communities, explore their work, and read official announcements.</p></header><ClubDirectory clubs={clubs} total={total} hasNext={hasNext} categories={categories} search={search} /></main>;
}
