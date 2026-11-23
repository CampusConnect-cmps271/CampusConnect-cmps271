import { describe, expect, it } from "vitest";
import {
  communitiesHref,
  directorySearchFilter,
  escapeLikePattern,
  isDirectorySearched,
  MAX_PAGES,
  parseDirectorySearch,
  parsePages,
  parsePostFeed,
  parseSearchText,
  type CommunitiesView,
} from "./search";

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

describe("the communities page's address", () => {
  const plain: CommunitiesView = { search: parseDirectorySearch({}), searched: false, posts: "following", feed: 1 };

  it("counts a submitted search, even an empty one, as searching", () => {
    expect(isDirectorySearched({})).toBe(false);
    expect(isDirectorySearched({ posts: "all" })).toBe(false);
    expect(isDirectorySearched({ q: "" })).toBe(true);
    expect(isDirectorySearched({ topic: "housing" })).toBe(true);
  });

  it("shows posts from followed communities unless asked for all", () => {
    expect(parsePostFeed(undefined)).toBe("following");
    expect(parsePostFeed("all")).toBe("all");
    expect(parsePostFeed("everything")).toBe("following");
  });

  it("is bare when nothing is chosen", () => {
    expect(communitiesHref(plain, {}, "posts")).toBe("/communities#posts");
  });

  it("switches the posts and starts their pages again, keeping the search", () => {
    const view: CommunitiesView = {
      search: parseDirectorySearch({ q: "chess", topic: "interest", sort: "active", pages: "2" }),
      searched: true,
      posts: "following",
      feed: 3,
    };
    expect(communitiesHref(view, { posts: "all", feed: 1 }, "posts")).toBe(
      "/communities?q=chess&topic=interest&sort=active&pages=2&posts=all#posts",
    );
  });

  it("keeps an empty search, so every community stays listed", () => {
    expect(communitiesHref({ ...plain, searched: true }, { pages: 2 }, "find")).toBe("/communities?q=&pages=2#find");
  });

  it("grows the posts while keeping the switch", () => {
    expect(communitiesHref({ ...plain, posts: "all" }, { feed: 2 }, "posts")).toBe("/communities?posts=all&feed=2#posts");
  });
});
