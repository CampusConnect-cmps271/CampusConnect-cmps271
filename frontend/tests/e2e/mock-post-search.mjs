// Synthetic browser fixtures only. The actual PostgreSQL tokenization, rank,
// access policies and GIN index are tested in tests/post-search.test.mjs.
const author = "00000000-0000-4000-8000-000000000001";
const record = (index, title, body, extra = {}) => ({
  id: `f1430000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  author_id: author, title, body, category: "General", status: "published",
  created_at: "2026-10-01T12:00:00Z", edited_at: null, ...extra,
});
export const postSearchFixtures = [
  record(1, "Scholarships for campus students", "Application deadlines and eligibility."),
  record(2, "Financial aid questions", "Scholarships information and application support.", { created_at: "2026-10-03T12:00:00Z" }),
  record(3, "المنح الدراسية للطلاب", "معلومات عن الطلبات والمواعيد"),
  record(4, "Mixed language guidance", "Scholarships المنح information.", { created_at: "2026-10-02T12:00:00Z" }),
  record(5, "Script safety example", "rendercheck <script>alert('not-run')</script> is literal post text."),
  record(6, "Deleted scholarships المنح information", "This record must never appear.", { status: "deleted" }),
  ...Array.from({ length: 25 }, (_, index) => record(100 + index, `Searchpagination question ${String(index + 1).padStart(2, "0")}`, "A synthetic post for browser pagination.")),
];
const tokens = (text) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export async function handlePostSearch(request, response, url, claims, additionalPosts) {
  if (url.pathname !== "/rest/v1/rpc/search_published_posts" || request.method !== "POST") return false;
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const args = JSON.parse(raw);
  if (!claims.sub || claims.email === "search-unavailable@mail.aub.edu") {
    response.statusCode = 503;
    response.end(JSON.stringify({ code: "57014", message: "Synthetic private post search failure" }));
    return true;
  }
  if (claims.email === "search-invalid@mail.aub.edu") {
    response.end(JSON.stringify([{ ...postSearchFixtures[0], relevance: -1 }]));
    return true;
  }
  const terms = tokens(Array.from(args.p_query ?? "").slice(0, 200).join(""));
  const rows = terms.length === 0 ? [] : [...postSearchFixtures, ...additionalPosts]
    .filter((post) => post.status === "published")
    .filter((post) => terms.every((term) => [...tokens(post.title), ...tokens(post.body)].includes(term)))
    .map((post) => ({ ...post, relevance: terms.reduce((score, term) => score + (tokens(post.title).includes(term) ? 1 : 0.4), 0) }))
    .sort((a, b) => b.relevance - a.relevance || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const size = Math.min(50, Math.max(1, args.p_page_size ?? 20));
  const page = Math.min(10000, Math.max(1, args.p_page ?? 1));
  response.end(JSON.stringify(rows.slice((page - 1) * size, page * size + 1)));
  return true;
}
