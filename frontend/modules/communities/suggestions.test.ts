import { describe, expect, it } from "vitest";
import { matchesInterest, suggestCommunities } from "./suggestions";
import type { CommunitySummary } from "./types";

const CMPS271 = "10000000-0000-4000-8000-000000000271";
const MATH201 = "10000000-0000-4000-8000-000000000201";

function community(id: string, values: Partial<CommunitySummary> = {}): CommunitySummary {
  return {
    id,
    slug: id,
    name: id,
    description: null,
    topic: "other",
    courseId: null,
    courseCode: null,
    courseName: null,
    ownerId: "owner",
    status: "active",
    archivedAt: null,
    createdAt: "2026-11-01T00:00:00Z",
    memberCount: 1,
    followerCount: 1,
    lastActivityAt: "2026-11-01T00:00:00Z",
    ...values,
  };
}

const plans = [
  { term: "Spring 2027", courses: [{ courseId: CMPS271, code: "CMPS 271" }] },
  { term: "Fall 2027", courses: [{ courseId: MATH201, code: "MATH 201" }, { courseId: CMPS271, code: "CMPS 271" }] },
];

describe("community suggestions", () => {
  it("names the plan a course community's course is in, the earliest plan first", () => {
    const suggestions = suggestCommunities({
      plans,
      interests: [],
      candidates: [
        community("math", { name: "MATH 201 problem sessions", topic: "course", courseId: MATH201, memberCount: 50 }),
        community("cmps", { name: "CMPS 271 study group", topic: "course", courseId: CMPS271 }),
      ],
    });
    expect(suggestions.map(({ community, reason }) => [community.id, reason])).toEqual([
      ["cmps", "CMPS 271 is in your Spring 2027 plan"],
      ["math", "MATH 201 is in your Fall 2027 plan"],
    ]);
  });

  it("suggests communities matching an interest by name or topic, most members first", () => {
    const suggestions = suggestCommunities({
      plans: [],
      interests: ["Chess", " housing "],
      candidates: [
        community("chess", { name: "Chess & Coffee", topic: "interest", memberCount: 3 }),
        community("flat", { name: "Flatmates wanted", topic: "housing", memberCount: 9 }),
        community("party", { name: "Party planning", topic: "student_life" }),
      ],
    });
    expect(suggestions.map(({ community, reason }) => [community.id, reason])).toEqual([
      ["flat", "Matches your interest: housing"],
      ["chess", "Matches your interest: Chess"],
    ]);
  });

  it("puts course suggestions before interest ones and gives each community one reason", () => {
    const suggestions = suggestCommunities({
      plans,
      interests: ["Software"],
      candidates: [
        community("se", { name: "Software engineering fans", topic: "interest", memberCount: 100 }),
        community("cmps", { name: "CMPS 271 Software", topic: "course", courseId: CMPS271 }),
        community("cmps", { name: "CMPS 271 Software", topic: "course", courseId: CMPS271 }),
      ],
    });
    expect(suggestions.map(({ community, reason }) => [community.id, reason])).toEqual([
      ["cmps", "CMPS 271 is in your Spring 2027 plan"],
      ["se", "Matches your interest: Software"],
    ]);
  });

  it("leaves out archived communities, unmatched ones, and anything past the limit", () => {
    const candidates = Array.from({ length: 8 }, (_, index) =>
      community(`c${index}`, { name: `Chess club ${index}`, memberCount: index }),
    );
    candidates.push(community("old", { name: "Chess archive", status: "archived" }));
    candidates.push(community("none", { name: "Robotics" }));
    const suggestions = suggestCommunities({ plans: [], interests: ["chess"], candidates, limit: 3 });
    expect(suggestions.map(({ community }) => community.id)).toEqual(["c7", "c6", "c5"]);
  });
});

describe("matching an interest", () => {
  it("matches whole words, ignoring case", () => {
    expect(matchesInterest({ name: "Machine Learning reading group", topic: "interest" }, "machine learning")).toBe(true);
    expect(matchesInterest({ name: "Party planning", topic: "student_life" }, "art")).toBe(false);
    expect(matchesInterest({ name: "AI and art", topic: "interest" }, "AI")).toBe(true);
  });

  it("matches a topic by its label, and Arabic names", () => {
    expect(matchesInterest({ name: "Anything", topic: "student_life" }, "Student life")).toBe(true);
    expect(matchesInterest({ name: "نادي الشطرنج", topic: "interest" }, "الشطرنج")).toBe(true);
  });

  it("ignores one-letter interests", () => {
    expect(matchesInterest({ name: "A team", topic: "other" }, "a")).toBe(false);
  });
});
