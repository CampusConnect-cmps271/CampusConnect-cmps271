import { describe, expect, it } from "vitest";
import { formatRating, ratingRowSchema, summarizeRating } from "./model";

const row = {
  course_id: "10000000-0000-4000-8000-000000000001", review_count: 3,
  average_difficulty: 10 / 3, average_workload: 8 / 3,
  average_usefulness: 11 / 3, average_overall: 4,
};

describe("course rating presentation contract", () => {
  it.each([0, 1, 2])("hides averages at %s reviews", (review_count) => {
    const data = review_count === 0 ? { ...row, review_count,
      average_difficulty: null, average_workload: null, average_usefulness: null, average_overall: null,
    } : { ...row, review_count };
    expect(summarizeRating(ratingRowSchema.parse(data))).toEqual({ status: "insufficient", reviewCount: review_count });
  });

  it("shows every independent dimension at exactly three reviews without changing source precision", () => {
    const summary = summarizeRating(ratingRowSchema.parse(row));
    expect(summary).toEqual({ status: "ready", reviewCount: 3, averages: {
      average_difficulty: 10 / 3, average_workload: 8 / 3, average_usefulness: 11 / 3, average_overall: 4,
    } });
  });

  it("accepts database numeric strings while keeping one-decimal formatting at presentation time", () => {
    const parsed = ratingRowSchema.parse({ ...row, review_count: "3", average_difficulty: "3.3333333333333333" });
    expect(parsed.average_difficulty).toBeCloseTo(10 / 3, 12);
    expect(formatRating(parsed.average_difficulty!)).toBe("3.3");
    expect(formatRating(4)).toBe("4.0");
    expect(formatRating(3.25)).toBe("3.3");
    expect(formatRating(1)).toBe("1.0");
    expect(formatRating(5)).toBe("5.0");
  });

  it.each([null, "", false, "NaN", NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid review count: %s", (review_count) => {
      expect(ratingRowSchema.safeParse({ ...row, review_count }).success).toBe(false);
    },
  );
  it.each([null, "", true, "NaN", NaN, Infinity, 0, 5.1])("rejects an invalid average: %s", (average_overall) => {
    expect(ratingRowSchema.safeParse({ ...row, average_overall }).success).toBe(false);
  });
  it("rejects inconsistent zero counts, missing dimensions and invalid course identities", () => {
    expect(ratingRowSchema.safeParse({ ...row, review_count: 0 }).success).toBe(false);
    expect(ratingRowSchema.safeParse({ ...row, average_overall: undefined }).success).toBe(false);
    expect(ratingRowSchema.safeParse({ ...row, course_id: "not-a-uuid" }).success).toBe(false);
  });
});
