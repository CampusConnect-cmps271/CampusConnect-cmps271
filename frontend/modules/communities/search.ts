import { isCommunityTopic, type CommunityTopic } from "./schema";

export const SEARCH_LENGTH = 80;
export const DIRECTORY_PAGE_SIZE = 24;
export const POSTS_PAGE_SIZE = 20;
/** "Load more" grows a list one page at a time, up to this many pages. */
export const MAX_PAGES = 10;

export type DirectorySort = "members" | "active";

export type DirectorySearch = {
  q: string;
  topic: CommunityTopic | null;
  sort: DirectorySort;
  pages: number;
};

type Param = string | string[] | undefined;

function first(value: Param): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** The search text, tidied and bounded. */
export function parseSearchText(value: Param): string {
  return first(value).replace(/\s+/g, " ").trim().slice(0, SEARCH_LENGTH);
}

/** How many pages of a list to show, from a "Load more" link's ?pages=. */
export function parsePages(value: Param): number {
  const pages = Number.parseInt(first(value), 10);
  return Number.isFinite(pages) && pages >= 1 ? Math.min(pages, MAX_PAGES) : 1;
}

export function parseDirectorySearch(params: Record<string, Param>): DirectorySearch {
  const topic = first(params.topic);
  return {
    q: parseSearchText(params.q),
    topic: isCommunityTopic(topic) ? topic : null,
    sort: first(params.sort) === "active" ? "active" : "members",
    pages: parsePages(params.pages),
  };
}

/** Escapes LIKE's wildcards and its escape character, so they match themselves. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/**
 * A PostgREST `or` filter matching a community's name or description. The
 * pattern is quoted, so commas, parentheses and quotes in the search stay
 * search text. ILIKE ignores case, and leaves Arabic and other scripts as
 * they are.
 */
export function directorySearchFilter(q: string): string {
  const pattern = JSON.stringify(`%${escapeLikePattern(q)}%`);
  return `name.ilike.${pattern},description.ilike.${pattern}`;
}
