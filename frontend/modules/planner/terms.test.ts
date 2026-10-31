import { describe, expect, it } from "vitest";
import { courseSearchFilter, parsePlannerSearch } from "./search";
import { availableTerms, beirutToday, formatTermDate, OFFICIAL_TERMS, openTerms, TERM_PATTERN } from "./terms";
import { formatMeeting, sortMeetings } from "./time";

describe("official AUB terms", () => {
  it("are valid plans: matching the term pattern, ending after they start, within 200 days", () => {
    for (const official of OFFICIAL_TERMS) {
      expect(official.term).toMatch(TERM_PATTERN);
      const days = (Date.parse(official.endsOn) - Date.parse(official.startsOn)) / 86_400_000;
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(200);
    }
  });

  it("offer only terms whose classes haven't ended", () => {
    expect(openTerms("2026-10-31").map((official) => official.term)).toEqual(["Fall 2026", "Spring 2027", "Summer 2027"]);
    expect(openTerms("2026-12-04").map((official) => official.term)).toEqual(["Fall 2026", "Spring 2027", "Summer 2027"]);
    expect(openTerms("2026-12-05").map((official) => official.term)).toEqual(["Spring 2027", "Summer 2027"]);
    expect(openTerms("2027-07-16")).toEqual([]);
  });

  it("leave out terms the student already planned", () => {
    expect(availableTerms(["Spring 2027"], "2026-10-31").map((official) => official.term)).toEqual(["Fall 2026", "Summer 2027"]);
  });

  it("take today's date in Beirut, not UTC", () => {
    // 22:30 UTC on 31 Dec is already 1 January in Beirut (UTC+2).
    expect(beirutToday(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
    expect(beirutToday(new Date("2026-12-31T21:30:00Z"))).toBe("2026-12-31");
  });

  it("format calendar dates without shifting the day", () => {
    expect(formatTermDate("2027-01-13")).toBe("Wed, 13 Jan 2027");
    expect(formatTermDate("2026-12-04")).toBe("Fri, 4 Dec 2026");
  });
});

describe("meeting display", () => {
  const meeting = { weekday: 2 as const, start_minute: 570, end_minute: 645, timezone: "Asia/Beirut" };

  it("reads as day, times and zone", () => {
    expect(formatMeeting(meeting)).toBe("Tue 09:30–10:45 (Asia/Beirut)");
  });

  it("sorts by day, then start and end", () => {
    const sorted = sortMeetings([
      { ...meeting, weekday: 3 as const },
      { ...meeting, start_minute: 600 },
      { ...meeting, weekday: 1 as const },
      { ...meeting },
    ]);
    expect(sorted.map((row) => [row.weekday, row.start_minute])).toEqual([[1, 570], [2, 570], [2, 600], [3, 570]]);
  });
});

describe("course search", () => {
  it("tidies and bounds the search text", () => {
    expect(parsePlannerSearch(["  CMPS   240 ", "ignored"])).toBe("CMPS 240");
    expect(parsePlannerSearch(undefined)).toBe("");
    expect(parsePlannerSearch("x".repeat(200))).toHaveLength(80);
  });

  it("matches code or name, spacing compact codes", () => {
    expect(courseSearchFilter("CMPS240")).toBe('code.ilike."%CMPS 240%",name.ilike."%CMPS240%"');
  });

  it("escapes LIKE wildcards and quotes PostgREST syntax", () => {
    expect(courseSearchFilter('100%_off "a,b" (c)\\')).toBe(
      'code.ilike."%100\\\\%\\\\_off \\"a,b\\" (c)\\\\\\\\%",name.ilike."%100\\\\%\\\\_off \\"a,b\\" (c)\\\\\\\\%"',
    );
  });
});
