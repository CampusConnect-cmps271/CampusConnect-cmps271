/** Which box the board's search looks in. */
export type SearchField = "teach" | "learn";

/** Longest search term the board accepts, in characters. */
export const SEARCH_TERM_LENGTH = 100;

/** How many SkillSwap posts the board shows at a time. */
export const BOARD_PAGE_SIZE = 20;

/** The most pages "Load more" can reach. */
export const BOARD_MAX_PAGES = 10;

/**
 * Makes a search term safe inside an ILIKE pattern: %, _ and the escape
 * character itself match literally, so "50%" finds "50%", not everything.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** The board's search, read from the URL: ?q=python&in=learn&page=2. */
export type BoardSearch = {
  q: string;
  field: SearchField;
  page: number;
};

export function parseBoardSearch(params: {
  q?: string | string[];
  in?: string | string[];
  page?: string | string[];
}): BoardSearch {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? "";

  const q = first(params.q).replace(/\s+/g, " ").trim().slice(0, SEARCH_TERM_LENGTH);
  const field: SearchField = first(params.in) === "learn" ? "learn" : "teach";
  const page = Math.min(BOARD_MAX_PAGES, Math.max(1, Number.parseInt(first(params.page), 10) || 1));

  return { q, field, page };
}

/** The board's URL for a search and page, keeping the defaults out of it. */
export function boardHref({ q, field, page }: BoardSearch): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (field === "learn") params.set("in", "learn");
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/skillswap?${query}` : "/skillswap";
}
