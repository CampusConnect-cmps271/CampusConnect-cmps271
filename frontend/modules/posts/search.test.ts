import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), logError: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.logError } }));
import { normalizePostSearch } from "./search-input";
import { getPostSearchResults, PostSearchUnavailable } from "./search";

const post = (index: number) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  author_id: "00000000-0000-4000-8000-000000000001", title: "Synthetic title", body: "Synthetic body.",
  category: "Academics", created_at: "2026-10-01T12:00:00+00:00", edited_at: null, relevance: index / 100,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [post(1)], error: null });
});

describe("post search input", () => {
  it("normalizes whitespace without altering Arabic or SQL-looking search text", () => {
    expect(normalizePostSearch("  المكتبة\n library  ")).toEqual({ query: "المكتبة library", page: 1 });
    expect(normalizePostSearch("'; drop table posts; --").query).toBe("'; drop table posts; --");
  });
  it("bounds query length by Unicode characters without splitting emoji", () => {
    const input = normalizePostSearch("😀".repeat(201));
    expect(Array.from(input.query)).toHaveLength(200);
    expect(input.query.endsWith("😀")).toBe(true);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("normalizes an invalid page: %s", (page) => {
    expect(normalizePostSearch("library", page).page).toBe(1);
  });
  it("caps a valid but excessive page", () => { expect(normalizePostSearch("library", 10001).page).toBe(10000); });
});

describe("authenticated ranked post search", () => {
  it("authenticates before handling even an empty query", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("redirect"));
    await expect(getPostSearchResults("")).rejects.toThrow("redirect");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("does not turn blank input into an unfiltered feed query", async () => {
    expect(await getPostSearchResults(" \n ")).toEqual({ query: "", page: 1, posts: [], hasMore: false, nextPage: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("calls the parameterized RPC with normalized input and preserves database relevance order", async () => {
    const rows = [{ ...post(2), relevance: 2 }, { ...post(1), relevance: 1 }];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });
    const result = await getPostSearchResults("  المكتبة  library ", 2);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("search_published_posts", { p_query: "المكتبة library", p_page: 2, p_page_size: 20 });
    expect(result).toEqual({ query: "المكتبة library", page: 2, posts: rows, hasMore: false, nextPage: null });
  });
  it("uses one lookahead row without exposing it on the current page", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => post(index));
    mocks.rpc.mockResolvedValue({ data: rows, error: null });
    const result = await getPostSearchResults("library", 2);
    expect(result.posts).toEqual(rows.slice(0, 20));
    expect(result.hasMore).toBe(true); expect(result.nextPage).toBe(3);
  });
  it("does not advertise an inaccessible page after the maximum page", async () => {
    mocks.rpc.mockResolvedValue({ data: Array.from({ length: 21 }, (_, index) => post(index)), error: null });
    expect(await getPostSearchResults("library", 10000)).toMatchObject({ page: 10000, hasMore: false, nextPage: null });
  });
  it("distinguishes a successful zero-match result from a database failure", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await getPostSearchResults("nothing")).toMatchObject({ posts: [], hasMore: false, nextPage: null });
    expect(mocks.logError).not.toHaveBeenCalled();
  });
  it.each([
    { data: null }, { data: [post(1), post(1)] }, { data: [{ ...post(1), relevance: -1 }] },
    { data: [{ ...post(1), created_at: "invalid" }] }, { data: [{ ...post(1), author_id: "not-a-uuid" }] },
    { data: Array.from({ length: 22 }, (_, index) => post(index)) },
  ])("rejects malformed or excessive RPC data: $data", async ({ data }) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(getPostSearchResults("library")).rejects.toThrow(PostSearchUnavailable);
    expect(mocks.logError).toHaveBeenCalledExactlyOnceWith("posts.search.read_failure", { code: "invalid_data" });
  });
  it("does not log queries, posts or private database errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "private search text" } });
    await expect(getPostSearchResults("private student question")).rejects.toThrow("Post search is temporarily unavailable.");
    expect(mocks.logError).toHaveBeenCalledExactlyOnceWith("posts.search.read_failure", { code: "57014" });
  });
  it("handles a transport exception with a safe retry error", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("private connection text"));
    await expect(getPostSearchResults("library")).rejects.toThrow(PostSearchUnavailable);
    expect(mocks.logError).toHaveBeenCalledExactlyOnceWith("posts.search.read_failure", { code: "connection_failure" });
  });
});
