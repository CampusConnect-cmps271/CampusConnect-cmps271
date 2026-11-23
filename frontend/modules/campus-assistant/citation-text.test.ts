import { describe, expect, it } from "vitest";
import { citationSourceText } from "./citation-text";

describe("citationSourceText", () => {
  it("names the source and the day an AUB page was retrieved", () => {
    expect(citationSourceText({ retrieved_at: "2026-10-24T08:00:00.000Z", source_label: "AUB website" })).toBe(
      "AUB website, retrieved Oct 24, 2026",
    );
  });

  it("names the source alone when the content is live data, not a fetched page", () => {
    expect(citationSourceText({ retrieved_at: null, source_label: "Student clubs" })).toBe("Student clubs");
    expect(citationSourceText({ retrieved_at: null, source_label: "Your semester plan" })).toBe("Your semester plan");
  });

  it("never calls a club, an event or a plan the course catalogue, which the panel used to do for every undated source", () => {
    for (const label of ["Student clubs", "Campus events", "Your semester plan", "Your saved events", "Your posts", "Campus feed"]) {
      expect(citationSourceText({ retrieved_at: null, source_label: label })).not.toMatch(/catalogue/i);
    }
  });

  it("copes with an answer from before labels existed (an older cached reply)", () => {
    expect(citationSourceText({ retrieved_at: null })).toBe("CampusConnect");
    expect(citationSourceText({ retrieved_at: "2026-10-24T08:00:00.000Z" })).toBe("retrieved Oct 24, 2026");
  });

  it("does not show a made-up date for a date it cannot read", () => {
    expect(citationSourceText({ retrieved_at: "not a date", source_label: "AUB website" })).toBe("AUB website, retrieved on an unknown date");
  });
});
