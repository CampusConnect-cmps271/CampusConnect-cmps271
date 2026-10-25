export const CLUB_PAGE_SIZE = 9;

export type ClubDirectorySearch = { q: string; category: string; page: number };

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export function readClubSearch(params: Record<string, string | string[] | undefined>): ClubDirectorySearch {
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).slice(0, 120),
    category: first(params.category).slice(0, 80),
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100) : 1,
  };
}

export function clubDirectoryUrl(search: ClubDirectorySearch) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.category) params.set("category", search.category);
  if (search.page > 1) params.set("page", String(search.page));
  const query = params.toString();
  return query ? `/clubs?${query}` : "/clubs";
}

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
