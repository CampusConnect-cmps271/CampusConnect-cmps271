import { describe, expect, it } from "vitest";
import { clubDirectoryUrl, escapeLikePattern, readClubSearch } from "./search";

describe("club directory search", () => {
  it("normalizes defaults and invalid pages", () => {
    expect(readClubSearch({})).toEqual({ q: "", category: "", page: 1 });
    expect(readClubSearch({ page: "-4" }).page).toBe(1);
    expect(readClubSearch({ page: "999" }).page).toBe(100);
  });

  it("keeps a stable first value and caps untrusted input", () => {
    const result = readClubSearch({ q: ["  robotics ", "ignored"], category: "Academic", page: "2" });
    expect(result).toEqual({ q: "robotics", category: "Academic", page: 2 });
    expect(readClubSearch({ q: "x".repeat(300) }).q).toHaveLength(120);
  });

  it("creates encoded pagination links", () => {
    expect(clubDirectoryUrl({ q: "women in tech", category: "Academic & Tech", page: 2 }))
      .toBe("/clubs?q=women+in+tech&category=Academic+%26+Tech&page=2");
    expect(clubDirectoryUrl({ q: "", category: "", page: 1 })).toBe("/clubs");
  });

  it("escapes PostgREST wildcard characters", () => {
    expect(escapeLikePattern("50%_C:\\club")).toBe("50\\%\\_C:\\\\club");
  });
});
