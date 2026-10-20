export const POST_SEARCH_PAGE_SIZE = 20;
export const POST_SEARCH_MAX_PAGE = 10000;
export const POST_SEARCH_MAX_QUERY = 200;

export function normalizePostSearch(value: string, page = 1) {
  // Count Unicode characters so truncation never leaves half a surrogate pair.
  const query = Array.from(value.replace(/\s+/gu, " ").trim()).slice(0, POST_SEARCH_MAX_QUERY).join("");
  return { query, page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, POST_SEARCH_MAX_PAGE) : 1 };
}
