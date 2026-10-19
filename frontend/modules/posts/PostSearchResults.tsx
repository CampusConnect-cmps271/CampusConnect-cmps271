import Link from "next/link";
import { getPostSearchResults, PostSearchUnavailable } from "./search";
import { newQuestionUrl, postSearchUrl } from "./search-navigation";
import styles from "./post-search.module.css";

const date = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Beirut" });

export async function PostSearchResults({ query, page }: { query: string; page: number }) {
  if (!query) return <section className={styles.notice} aria-labelledby="search-start-title">
    <h2 id="search-start-title">What are you looking for?</h2><p>Enter keywords to search published campus posts.</p>
  </section>;
  let result;
  try { result = await getPostSearchResults(query, page); }
  catch (error) {
    if (!(error instanceof PostSearchUnavailable)) throw error;
    return <section role="alert" aria-labelledby="search-error-title" className={styles.notice}>
      <h2 id="search-error-title">Posts couldn’t be searched</h2>
      <p>Search is temporarily unavailable. Your question is still here; please try again.</p>
      <a href={postSearchUrl(query, page)}>Try search again</a>
    </section>;
  }
  if (result.posts.length === 0) return page > 1 ?
    <section className={styles.notice} aria-labelledby="search-page-empty-title">
      <h2 id="search-page-empty-title">That page has no results</h2>
      <p>Results may have changed. Return to the first page for this search.</p>
      <Link href={postSearchUrl(query)}>First page of results</Link>
    </section> : <section className={styles.notice} aria-labelledby="search-empty-title">
      <h2 id="search-empty-title">No posts found</h2>
      <p>No published posts matched <bdi>“{query}”</bdi>. Try fewer keywords, or ask the campus community.</p>
      <Link className={styles.primary} href={newQuestionUrl(query)}>Ask this question</Link>
    </section>;
  return <>
    <p role="status" className={styles.summary}>{result.posts.length} {result.posts.length === 1 ? "result" : "results"} on this page for <bdi>“{query}”</bdi> · Sorted by relevance</p>
    <section className={styles.results} aria-label="Post search results">
      {result.posts.map((post) => <article key={post.id} className={styles.card}>
        <div className={styles.meta}><span>{post.category}</span><time dateTime={post.created_at}>{date.format(new Date(post.created_at))}</time></div>
        <h2><Link href={`/posts/${post.id}`} dir="auto">{post.title}</Link></h2>
        <p dir="auto" className={styles.excerpt}>{post.body}</p>
        {post.edited_at && <p className={styles.hint}>Edited</p>}
      </article>)}
    </section>
    <nav className={styles.pagination} aria-label="Post search pages">
      <span>{page > 1 && <Link href={postSearchUrl(query, page - 1)}>← Previous results</Link>}</span>
      <span>Page {page}</span>
      <span>{result.nextPage !== null && <Link href={postSearchUrl(query, result.nextPage)}>Next results →</Link>}</span>
    </nav>
  </>;
}
