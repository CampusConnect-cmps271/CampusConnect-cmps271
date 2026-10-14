import { describe, expect, it } from "vitest";
import { EXCERPT_LENGTH, excerpt, formatPostDate } from "./pinned-post";

describe("pinned post excerpt", () => {
  it("keeps a short body whole, on one line", () => {
    expect(excerpt("  Study group\n\ntonight   at 7  ")).toBe("Study group tonight at 7");
  });

  it("cuts a long body at a word boundary and marks the cut", () => {
    const body = "word ".repeat(100);
    const result = excerpt(body);

    expect(result.length).toBeLessThanOrEqual(EXCERPT_LENGTH);
    expect(result.endsWith("word…")).toBe(true);
  });

  it("leaves a body of exactly the limit untouched", () => {
    const body = "x".repeat(EXCERPT_LENGTH);
    expect(excerpt(body)).toBe(body);
  });

  it("hard-cuts a single very long word", () => {
    const result = excerpt("a".repeat(500), 20);
    expect(result).toBe(`${"a".repeat(19)}…`);
  });

  it("is empty for a blank body", () => {
    expect(excerpt(" \n ")).toBe("");
  });
});

describe("pinned post date", () => {
  it("shows the day on campus, not in UTC", () => {
    // 22:30 UTC on 13 October is 01:30 on 14 October in Beirut.
    expect(formatPostDate("2026-10-13T22:30:00Z")).toBe("Oct 14, 2026");
  });
});
