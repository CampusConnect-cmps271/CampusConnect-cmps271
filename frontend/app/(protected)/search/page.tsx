import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import { parsePostSearch, type PostSearchParams } from "@/modules/posts/search-navigation";
import { PostSearchForm } from "@/modules/posts/PostSearchForm";
import { PostSearchResults } from "@/modules/posts/PostSearchResults";
import styles from "@/modules/posts/post-search.module.css";

export const metadata: Metadata = { title: "Search posts · CampusConnect" };

export default async function PostSearchPage({ searchParams }: { searchParams: Promise<PostSearchParams> }) {
  await requireUser();
  const { query, page } = parsePostSearch(await searchParams);
  return <AppShell>
<main className={styles.page}>
    <Link href="/home">← Back to feed</Link>
    <header className={styles.header}><h1>Search campus posts</h1><p>Find previous questions and useful information from your campus community.</p></header>
    <PostSearchForm key={query} query={query} showClear />
    <PostSearchResults query={query} page={page} />
  </main>
</AppShell>;
}
