import { normalizePostSearch } from "./search-input";

export type PostSearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export function parsePostSearch(params: PostSearchParams) {
  return normalizePostSearch(first(params.q), Number(first(params.page)));
}

export function postSearchUrl(query: string, page = 1) {
  const input = normalizePostSearch(query, page);
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.query && input.page > 1) params.set("page", String(input.page));
  return params.size ? `/search?${params}` : "/search";
}

export function questionTitle(value: string) {
  // Post titles use a 200 UTF-16-unit validation limit. Preserve whole Unicode
  // characters when prefilling from a search query with a different length unit.
  let title = "";
  for (const character of normalizePostSearch(value).query) {
    if (title.length + character.length > 200) break;
    title += character;
  }
  return title;
}

export function newQuestionUrl(query: string) {
  const title = questionTitle(query);
  return title ? `/posts/new?${new URLSearchParams({ title })}` : "/posts/new";
}

export function readQuestionTitle(params: PostSearchParams) {
  return questionTitle(first(params.title));
}
