import { describe, expect, it, vi } from "vitest";
import { COURSE_CHUNK, REGISTRAR_CHUNK } from "./fixtures";
import { createRateLimiter } from "./rate-limit";
import { reciprocalRankFusion, retrieveEvidence, searchTerms } from "./retrieval";

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
    rpc: vi.fn(async (fn: string) => {
      if (fn === "search_campus_chunks") return { data: pages, error };
      if (fn === "search_campus_courses") return { data: courses, error };
      return { data: [], error: null };
    }),
  });

  it("searches pages, courses, clubs and events with the extracted terms and bounded limits", async () => {
    const supabase = client([REGISTRAR_CHUNK], [courseRow]);

    const evidence = await retrieveEvidence(supabase, "Who issues transcripts?");

    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_chunks", { p_query: "issues transcripts", p_limit: 5 });
    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_courses", { p_query: "issues transcripts", p_limit: 6 });
    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_clubs", { p_query: "issues transcripts", p_limit: 3 });
    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_events", { p_query: "issues transcripts", p_limit: 3 });
    expect(supabase.rpc).toHaveBeenCalledTimes(4);
    expect(evidence.map((chunk) => chunk.chunk_id)).toEqual(["registrar:0", "course:CMPS 271"]);
  });

  describe("clubs and events", () => {
    const clubRow = {
      slug: "robotics-club",
      name: "Robotics Club",
      category: "Technology",
      description: "Build and race robots every semester.",
      public_website: "https://robotics.example.org",
    };
    const eventRow = {
      id: "6f1c2a40-1b2c-4d3e-8f50-123456789abc",
      title: "Robot Demo Night",
      description: "Watch the club's robots compete.",
      starts_at: "2026-11-13T16:00:00Z",
      ends_at: "2026-11-13T18:00:00Z",
      location: "Bliss Hall 204",
      category: "Technology",
      club_name: "Robotics Club",
      registration_url: null,
    };
    const rows = (byFunction: Record<string, unknown[] | { error: { code: string } }>) => ({
      rpc: vi.fn(async (fn: string) => {
        const answer = byFunction[fn] ?? [];
        return Array.isArray(answer) ? { data: answer, error: null } : { data: null, error: answer.error };
      }),
    });

    it("turns a club row into evidence linked to the app's club page", async () => {
      const [club] = await retrieveEvidence(rows({ search_campus_clubs: [clubRow] }), "robotics club");

      expect(club).toEqual({
        chunk_id: "club:robotics-club",
        source_id: "club-directory",
        url: "/clubs/robotics-club",
        title: "Robotics Club (club)",
        retrieved_at: null,
        text: "Club Robotics Club. Category: Technology. Description: Build and race robots every semester. Website: https://robotics.example.org",
      });
    });

    it("turns an event row into evidence with its Beirut time, linked to the app's event page", async () => {
      const [event] = await retrieveEvidence(rows({ search_campus_events: [eventRow] }), "robot demo");

      expect(event?.chunk_id).toBe("event:6f1c2a40-1b2c-4d3e-8f50-123456789abc");
      expect(event?.url).toBe("/events/6f1c2a40-1b2c-4d3e-8f50-123456789abc");
      expect(event?.title).toBe("Robot Demo Night (event)");
      // 16:00 UTC is 18:00 in Beirut in November (UTC+2).
      expect(event?.text).toContain("Friday, 13 November 2026");
      expect(event?.text).toContain("18:00");
      expect(event?.text).toContain("Where: Bliss Hall 204");
      expect(event?.text).toContain("organised by Robotics Club");
      expect(event?.text).toContain("Registration: none listed");
    });

    it("puts pages and courses before clubs and events", async () => {
      const evidence = await retrieveEvidence(
        rows({
          search_campus_chunks: [REGISTRAR_CHUNK],
          search_campus_courses: [courseRow],
          search_campus_clubs: [clubRow],
          search_campus_events: [eventRow],
        }),
        "robotics",
      );

      expect(evidence.map((chunk) => chunk.chunk_id)).toEqual([
        "registrar:0",
        "course:CMPS 271",
        "club:robotics-club",
        `event:${eventRow.id}`,
      ]);
    });

    it("merges keyword and meaning results for clubs and events without repeating one", async () => {
      const other = { ...clubRow, slug: "chess-club", name: "Chess Club" };
      const evidence = await retrieveEvidence(
        rows({
          search_campus_clubs: [clubRow],
          search_campus_clubs_semantic: [other, clubRow],
          search_campus_events: [eventRow],
          search_campus_events_semantic: [eventRow],
        }),
        "robotics",
        [0.1, 0.2],
      );

      const ids = evidence.map((chunk) => chunk.chunk_id);
      expect(ids.filter((id) => id.startsWith("club:"))).toEqual(["club:robotics-club", "club:chess-club"]);
      expect(ids.filter((id) => id.startsWith("event:"))).toEqual([`event:${eventRow.id}`]);
    });

    it("keeps the page and course answer when club or event search fails", async () => {
      const evidence = await retrieveEvidence(
        rows({
          search_campus_chunks: [REGISTRAR_CHUNK],
          search_campus_clubs: { error: { code: "42883" } },
          search_campus_events: { error: { code: "42883" } },
        }),
        "registrar",
      );

      expect(evidence.map((chunk) => chunk.chunk_id)).toEqual(["registrar:0"]);
    });
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

describe("reciprocalRankFusion", () => {
  const id = (item: string) => item;

  it("puts an item found by both lists above items found by only one", () => {
    expect(reciprocalRankFusion([["a", "b"], ["c", "b"]], id, 10)).toEqual(["b", "a", "c"]);
  });

  it("keeps a single list's order, breaks ties by first appearance and respects the limit", () => {
    expect(reciprocalRankFusion([["a", "b", "c"], []], id, 10)).toEqual(["a", "b", "c"]);
    expect(reciprocalRankFusion([["a", "b"], ["c", "d"]], id, 10)).toEqual(["a", "c", "b", "d"]);
    expect(reciprocalRankFusion([["a", "b", "c"]], id, 2)).toEqual(["a", "b"]);
  });
});

describe("retrieveEvidence with an embedding", () => {
  const embedding = [0.5, 0.25];
  const row = (code: string) => ({
    code, name: `Course ${code}`, department: "Test", credits: "3.00", prerequisites: "", description: "About it.",
  });
  const libraryChunk = { ...REGISTRAR_CHUNK, chunk_id: "libraries:1", source_id: "libraries" };
  const answers = (by: Record<string, { data: unknown[] | null; error?: { code?: string } | null }>) => ({
    rpc: vi.fn(async (fn: string) => ({ data: by[fn]?.data ?? [], error: by[fn]?.error ?? null })),
  });

  it("calls the keyword and the semantic searches and merges their pages", async () => {
    const supabase = answers({
      search_campus_chunks: { data: [REGISTRAR_CHUNK] },
      search_campus_chunks_semantic: { data: [libraryChunk, REGISTRAR_CHUNK] },
    });

    const evidence = await retrieveEvidence(supabase, "when does the library shut", embedding);

    expect(supabase.rpc).toHaveBeenCalledTimes(8);
    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_chunks_semantic", { p_embedding: "[0.5,0.25]", p_limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_courses_semantic", { p_embedding: "[0.5,0.25]", p_limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_clubs_semantic", { p_embedding: "[0.5,0.25]", p_limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith("search_campus_events_semantic", { p_embedding: "[0.5,0.25]", p_limit: 10 });
    expect(evidence.map((chunk) => chunk.chunk_id)).toEqual(["registrar:0", "libraries:1"]);
  });

  it("keeps a course named by its code first after merging", async () => {
    const supabase = answers({
      search_campus_courses: { data: [row("CMPS 271")] },
      search_campus_courses_semantic: { data: [row("PSYC 201"), row("CMPS 271")] },
    });

    const evidence = await retrieveEvidence(supabase, "CMPS 271", embedding);

    expect(evidence.map((chunk) => chunk.chunk_id)).toEqual(["course:CMPS 271", "course:PSYC 201"]);
  });

  it("keeps a course named in the question first even when the meaning search ranks another course higher", async () => {
    const supabase = answers({
      search_campus_courses: { data: [row("CMPS 271"), row("CMPS 289")] },
      search_campus_courses_semantic: { data: [row("CMPS 289")] },
    });

    const evidence = await retrieveEvidence(supabase, "CMPS 271 software engineering", embedding);

    expect(evidence.map((chunk) => chunk.chunk_id)).toEqual(["course:CMPS 271", "course:CMPS 289"]);
  });

  it("finds a course the keywords missed through the semantic search", async () => {
    const supabase = answers({ search_campus_courses_semantic: { data: [row("PSYC 201")] } });
    const evidence = await retrieveEvidence(supabase, "classes about how people think", embedding);
    expect(evidence.map((chunk) => chunk.chunk_id)).toEqual(["course:PSYC 201"]);
  });

  it("ignores an error from the semantic searches and still returns the keyword results", async () => {
    const supabase = answers({
      search_campus_chunks: { data: [REGISTRAR_CHUNK] },
      search_campus_chunks_semantic: { data: null, error: { code: "PGRST202" } },
      search_campus_courses_semantic: { data: null, error: { code: "PGRST202" } },
    });

    const evidence = await retrieveEvidence(supabase, "registrar", embedding);

    expect(evidence.map((chunk) => chunk.chunk_id)).toEqual(["registrar:0"]);
  });

  it("still throws on an error from the keyword searches", async () => {
    const supabase = answers({ search_campus_chunks: { data: null, error: { code: "42501" } } });
    await expect(retrieveEvidence(supabase, "registrar", embedding)).rejects.toThrow("database code: 42501");
  });

  it("calls nothing when the question is only filler words, even with an embedding", async () => {
    const supabase = answers({});
    expect(await retrieveEvidence(supabase, "what is the", embedding)).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("uses only the keyword searches when the embedding is missing", async () => {
    const supabase = answers({ search_campus_chunks: { data: [REGISTRAR_CHUNK] } });
    await retrieveEvidence(supabase, "registrar", null);
    expect(supabase.rpc).toHaveBeenCalledTimes(4);
    expect(supabase.rpc).not.toHaveBeenCalledWith(expect.stringMatching(/_semantic$/), expect.anything());
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
