import { describe, expect, it } from "vitest";
import { newQuestionUrl, parsePostSearch, postSearchUrl, questionTitle, readQuestionTitle } from "./search-navigation";

describe("post search navigation", () => {
  it("normalizes repeated query/page parameters and preserves Arabic", () => {
    expect(parsePostSearch({ q: ["  المنح\n scholarships  ", "ignored"], page: ["2", "3"] })).toEqual({ query: "المنح scholarships", page: 2 });
  });
  it.each(["", "0", "-1", "1.5", "2junk", "Infinity", "NaN"])("normalizes invalid page input: %s", (page) => {
    expect(parsePostSearch({ q: "library", page }).page).toBe(1);
  });
  it("bounds page and query length before sending them to the backend", () => {
    expect(parsePostSearch({ q: "س".repeat(201), page: "10001" })).toEqual({ query: "س".repeat(200), page: 10000 });
  });
  it("encodes query text without introducing extra URL parameters", () => {
    const query = "C++ & SQL? page=9 / المنح";
    const url = new URL(postSearchUrl(query, 2), "https://example.test");
    expect(url.pathname).toBe("/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: query, page: "2" });
    expect(parsePostSearch(Object.fromEntries(url.searchParams))).toEqual({ query, page: 2 });
  });
  it("omits empty queries and first-page defaults from links", () => {
    expect(postSearchUrl("", 50)).toBe("/search");
    expect(postSearchUrl("  scholarships  ")).toBe("/search?q=scholarships");
  });
});

describe("search to new-question handoff", () => {
  it("prefills only a normalized title without copying arbitrary query parameters", () => {
    const query = "How do I use C++ & SQL? المنح";
    const url = new URL(newQuestionUrl(query), "https://example.test");
    expect(url.pathname).toBe("/posts/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({ title: query });
    expect(readQuestionTitle({ title: ["  First\nquestion  ", "Second"], body: "ignored", category: "ignored" })).toBe("First question");
  });
  it("bounds a draft title to the existing post validator's UTF-16 limit without splitting characters", () => {
    expect(questionTitle("x".repeat(201))).toHaveLength(200);
    expect(questionTitle("😀".repeat(200))).toBe("😀".repeat(100));
    expect(questionTitle("x" + "😀".repeat(200))).toBe("x" + "😀".repeat(99));
  });
  it("leaves normal new-post visits blank", () => {
    expect(readQuestionTitle({})).toBe("");
    expect(newQuestionUrl(" \n ")).toBe("/posts/new");
  });
});
