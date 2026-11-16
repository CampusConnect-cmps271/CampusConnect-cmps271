import { describe, expect, it } from "vitest";
import { directorySearchFilter, escapeLikePattern, MAX_PAGES, parseDirectorySearch, parsePages, parseSearchText } from "./search";

describe("community search", () => {
  it("escapes LIKE's wildcards and its escape character", () => {
    expect(escapeLikePattern("100%_done\\")).toBe("100\\%\\_done\\\\");
  });

  it("matches name or description, case-insensitively, with the pattern quoted", () => {
    expect(directorySearchFilter("study")).toBe('name.ilike."%study%",description.ilike."%study%"');
  });

  it("keeps commas, parentheses and quotes as search text", () => {
    expect(directorySearchFilter('a,b) "c"')).toBe(
      'name.ilike."%a,b) \\"c\\"%",description.ilike."%a,b) \\"c\\"%"',
    );
  });

  it("escapes % and _ inside the quoted pattern", () => {
    expect(directorySearchFilter("50%_off")).toBe('name.ilike."%50\\\\%\\\\_off%",description.ilike."%50\\\\%\\\\_off%"');
  });

  it("leaves Arabic as it is", () => {
    expect(directorySearchFilter("سكن")).toBe('name.ilike."%سكن%",description.ilike."%سكن%"');
  });

  it("tidies and bounds the search text", () => {
    expect(parseSearchText("  CMPS   271 ")).toBe("CMPS 271");
    expect(parseSearchText(["first", "second"])).toBe("first");
    expect(parseSearchText("x".repeat(200))).toHaveLength(80);
  });

  it("reads the topic, sort and pages, ignoring anything unknown", () => {
    expect(parseDirectorySearch({ q: " chess ", topic: "interest", sort: "active", pages: "2" })).toEqual({
      q: "chess",
      topic: "interest",
      sort: "active",
      pages: 2,
    });
    expect(parseDirectorySearch({ topic: "sports", sort: "oldest", pages: "-1" })).toEqual({
      q: "",
      topic: null,
      sort: "members",
      pages: 1,
    });
  });

  it("caps Load more", () => {
    expect(parsePages("999")).toBe(MAX_PAGES);
    expect(parsePages("abc")).toBe(1);
    expect(parsePages(undefined)).toBe(1);
  });
});
