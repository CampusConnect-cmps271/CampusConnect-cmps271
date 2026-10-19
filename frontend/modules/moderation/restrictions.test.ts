import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  evaluateContentRestrictions,
  normalizeRestrictedContent,
} from "./restrictions";

const POST = {
  contentType: "post" as const,
  title: "Study group",
  body: "Does anyone want to study tomorrow?",
};

describe("Sprint 2 content restrictions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows ordinary campus content", () => {
    expect(evaluateContentRestrictions(POST, [])).toEqual({ allowed: true });
  });

  it.each(["You are an IDIOT", "Stop being a moron", "That is stupid"])(
    "blocks an English restricted term without exposing it: %s",
    (body) => {
      const result = evaluateContentRestrictions(
        { contentType: "comment", body },
        [],
      );
      expect(result).toMatchObject({ allowed: false, rule: "blocked_language" });
      if (!result.allowed) expect(result.message.toLowerCase()).not.toContain("idiot");
    },
  );

  it.each(["انت غبي", "يا أحمق", "هذا اَحْمَق"])(
    "blocks Arabic text including normalized forms: %s",
    (body) => {
      expect(
        evaluateContentRestrictions({ contentType: "comment", body }, []),
      ).toMatchObject({ allowed: false, rule: "blocked_language" });
    },
  );

  it("does not match an English term inside a longer word", () => {
    expect(
      evaluateContentRestrictions(
        { contentType: "comment", body: "The class uses stupidly large examples." },
        [],
      ),
    ).toEqual({ allowed: true });
  });

  it("blocks more than three links but accepts exactly three", () => {
    const three = "https://a.test https://b.test www.c.test";
    expect(
      evaluateContentRestrictions({ contentType: "comment", body: three }, []),
    ).toEqual({ allowed: true });
    expect(
      evaluateContentRestrictions(
        { contentType: "comment", body: `${three} https://d.test` },
        [],
      ),
    ).toMatchObject({ allowed: false, rule: "too_many_links" });
  });

  it("blocks identical content despite case and whitespace differences", () => {
    expect(
      evaluateContentRestrictions(
        { contentType: "post", title: " study GROUP ", body: "Same\nbody" },
        [{ id: "one", title: "Study Group", body: "same body" }],
      ),
    ).toMatchObject({ allowed: false, rule: "duplicate_content" });
  });

  it("excludes the current post from duplicate checks during an edit", () => {
    expect(
      evaluateContentRestrictions(
        { ...POST, excludeId: "current" },
        [{ id: "current", title: POST.title, body: POST.body }],
      ),
    ).toEqual({ allowed: true });
  });

  it("rate-limits the fourth post in the active window", () => {
    expect(
      evaluateContentRestrictions(POST, [
        { id: "1", title: "One", body: "One" },
        { id: "2", title: "Two", body: "Two" },
        { id: "3", title: "Three", body: "Three" },
      ]),
    ).toMatchObject({ allowed: false, rule: "posting_too_quickly" });
  });

  it("rate-limits the sixth comment in the active window", () => {
    const recent = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      body: `Different comment ${index}`,
    }));
    expect(
      evaluateContentRestrictions(
        { contentType: "comment", body: "A new comment" },
        recent,
      ),
    ).toMatchObject({ allowed: false, rule: "posting_too_quickly" });
  });

  it("normalizes Arabic diacritics, tatweel, case, and whitespace", () => {
    expect(normalizeRestrictedContent("  أَحْـمَق  TEST ")).toBe("احمق test");
  });
});

