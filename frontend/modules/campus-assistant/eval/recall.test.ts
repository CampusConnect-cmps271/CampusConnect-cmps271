import { describe, expect, it } from "vitest";
import questions from "./questions.json";
import { recallAtK } from "./recall";

describe("recallAtK", () => {
  it("is 1 when every expected id is in the first k and 0.5 when half are", () => {
    expect(recallAtK(["a", "b", "c"], ["a", "b"], 3)).toBe(1);
    expect(recallAtK(["a", "x", "c"], ["a", "b"], 3)).toBe(0.5);
    expect(recallAtK(["x", "y"], ["a", "b"], 3)).toBe(0);
  });

  it("only counts ids inside the first k results", () => {
    expect(recallAtK(["x", "y", "a"], ["a"], 2)).toBe(0);
    expect(recallAtK(["x", "y", "a"], ["a"], 3)).toBe(1);
  });

  it("scores an entry that expects nothing as 1 only when nothing is returned", () => {
    expect(recallAtK([], [], 5)).toBe(1);
    expect(recallAtK(["a"], [], 5)).toBe(0);
  });
});

describe("evaluation questions", () => {
  const kinds = new Set(["page", "course", "interest", "unrelated"]);

  it("gives every entry a unique id, a known kind and a question", () => {
    expect(new Set(questions.map((entry) => entry.id)).size).toBe(questions.length);
    for (const entry of questions) {
      expect(kinds.has(entry.kind), entry.id).toBe(true);
      expect(entry.question.trim().length, entry.id).toBeGreaterThan(5);
    }
  });

  it("expects stored-looking ids: a chunk id or course:CODE, and nothing for unrelated questions", () => {
    for (const entry of questions) {
      if (entry.kind === "unrelated") expect(entry.expect, entry.id).toEqual([]);
      else expect(entry.expect.length, entry.id).toBeGreaterThan(0);
      for (const id of entry.expect) expect(id, entry.id).toMatch(/^([a-z0-9-]+:\d+|course:[A-Z]{3,4} \d{3}[A-Z]?)$/);
    }
  });

  it("covers every answerable kind with at least ten questions and has at least three unrelated ones", () => {
    const count = (kind: string) => questions.filter((entry) => entry.kind === kind).length;
    for (const kind of ["page", "course", "interest"]) expect(count(kind), kind).toBeGreaterThanOrEqual(10);
    expect(count("unrelated")).toBeGreaterThanOrEqual(3);
  });
});
