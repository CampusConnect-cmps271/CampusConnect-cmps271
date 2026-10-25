import { describe, expect, it, vi } from "vitest";
import { COURSE_CHUNK, REGISTRAR_CHUNK } from "./fixtures";
import { createRateLimiter } from "./rate-limit";
import { retrieveEvidence, searchTerms } from "./retrieval";

describe("searchTerms", () => {
  it("drops filler words and punctuation, lower-cases and de-duplicates", () => {
    expect(searchTerms("What are the Library hours? Library!")).toEqual(["library", "hours"]);
  });

  it("keeps Arabic words and digits", () => {
    expect(searchTerms("ما هي مواعيد المكتبة 2026؟")).toEqual(["مواعيد", "المكتبة", "2026"]);
  });

  it("returns nothing for empty or symbol-only questions and caps the term count", () => {
    expect(searchTerms("  ?! ... ")).toEqual([]);
    expect(searchTerms("the of and")).toEqual([]);
    expect(searchTerms(Array.from({ length: 40 }, (_, n) => `word${n}`).join(" "))).toHaveLength(12);
  });

  it("splits course codes written without a space and drops the words course and prerequisite", () => {
    expect(searchTerms("What are the prerequisites of CMPS271 course?")).toEqual(["cmps", "271"]);
    expect(searchTerms("does math 201 have a pre-requisite?")).toEqual(["math", "201"]);
  });

  it("neutralises query operators by never passing raw punctuation on", () => {
    expect(searchTerms("registrar' | !drop & (table)")).toEqual(["registrar", "drop", "table"]);
  });
});

describe("retrieveEvidence", () => {
  const courseRow = {
    code: "CMPS 271",
    name: "Software Engineering",
    department: "Computer Science",
    credits: "3.00",
    prerequisites: "CMPS 200",
    description: "Team-based software development.",
  };
  const client = (pages: unknown[] | null, courses: unknown[] | null, error: { code?: string } | null = null) => ({
    rpc: vi.fn(async (fn: string) => ({ data: fn === "search_campus_chunks" ? pages : courses, error })),
  });

  it("searches pages and courses with the extracted terms and bounded limits", async () => {
    const supabase = client([REGISTRAR_CHUNK], [courseRow]);

    const evidence = await retrieveEvidence(supabase, "Who issues transcripts?");

    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_chunks", { p_query: "issues transcripts", p_limit: 5 });
    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_courses", { p_query: "issues transcripts", p_limit: 3 });
    expect(evidence.map((chunk) => chunk.chunk_id)).toEqual(["registrar:0", "course:CMPS 271"]);
  });

  it("turns a course row into evidence linked to the app's course page", async () => {
    const [course] = await retrieveEvidence(client([], [courseRow]), "CMPS 271");

    expect(course).toEqual(COURSE_CHUNK);
  });

  it("says when a course lists no prerequisites", async () => {
    const [course] = await retrieveEvidence(client([], [{ ...courseRow, prerequisites: "  " }]), "CMPS 271");
    expect(course?.text).toContain("Prerequisites: none listed.");
  });

  it("skips the database when the question has no searchable words", async () => {
    const supabase = client([], []);
    expect(await retrieveEvidence(supabase, "?!")).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("reports a database error by code only", async () => {
    await expect(retrieveEvidence(client(null, null, { code: "42501" }), "registrar")).rejects.toThrow("database code: 42501");
  });
});

describe("rate limiter", () => {
  it("allows the limit, then returns seconds to wait, then resets after the window", () => {
    let time = 0;
    const check = createRateLimiter(2, 60_000, () => time);

    expect([check("a"), check("a")]).toEqual([0, 0]);
    expect(check("a")).toBe(60);
    expect(check("b")).toBe(0);

    time = 30_000;
    expect(check("a")).toBe(30);
    time = 60_001;
    expect(check("a")).toBe(0);
  });
});
