import { describe, expect, it } from "vitest";
import { boardHref, escapeLikePattern, parseBoardSearch, SEARCH_TERM_LENGTH } from "./search";

describe("escapeLikePattern", () => {
  it("leaves ordinary words alone", () => {
    expect(escapeLikePattern("python")).toBe("python");
    expect(escapeLikePattern("اللغة الفرنسية")).toBe("اللغة الفرنسية");
  });

  it("makes % and _ match literally", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("snake_case")).toBe("snake\\_case");
  });

  it("escapes the escape character itself", () => {
    expect(escapeLikePattern("C:\\path")).toBe("C:\\\\path");
    expect(escapeLikePattern("\\%_")).toBe("\\\\\\%\\_");
  });
});

describe("parseBoardSearch", () => {
  it("defaults to searching who can teach, on the first page", () => {
    expect(parseBoardSearch({})).toEqual({ q: "", field: "teach", page: 1 });
  });

  it("reads the term, the box and the page", () => {
    expect(parseBoardSearch({ q: "  python  basics ", in: "learn", page: "3" })).toEqual({
      q: "python basics",
      field: "learn",
      page: 3,
    });
  });

  it("ignores anything it does not recognise", () => {
    expect(parseBoardSearch({ in: "both", page: "-2" })).toEqual({ q: "", field: "teach", page: 1 });
    expect(parseBoardSearch({ page: "999" }).page).toBe(10);
    expect(parseBoardSearch({ q: ["first", "second"] }).q).toBe("first");
  });

  it("caps the term's length", () => {
    expect(parseBoardSearch({ q: "x".repeat(500) }).q).toHaveLength(SEARCH_TERM_LENGTH);
  });
});

describe("boardHref", () => {
  it("keeps the defaults out of the URL", () => {
    expect(boardHref({ q: "", field: "teach", page: 1 })).toBe("/skillswap");
  });

  it("keeps the search in the URL", () => {
    expect(boardHref({ q: "français", field: "learn", page: 2 })).toBe(
      "/skillswap?q=fran%C3%A7ais&in=learn&page=2",
    );
  });
});
