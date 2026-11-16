import { describe, expect, it } from "vitest";
import { chosenCrns, linkedPrompt, sectionCountLabel, sectionOptions, sessionMeetings, sessionWhen, type ResisSection } from "./sections";

// Synthetic sections shaped like the Resis importer's; not AUB's schedule.
const at = (days: string, start = "09:00", end = "09:50", type = "Lecture") => ({ days, start, end, type, location: "Test Hall", instructor: "Test Instructor" });

describe("sessionMeetings: section times to weekly meetings", () => {
  it("gives one meeting per weekday letter, Monday first", () => {
    expect(sessionMeetings(at("MWF"))).toEqual([
      { weekday: 1, start_minute: 540, end_minute: 590 },
      { weekday: 3, start_minute: 540, end_minute: 590 },
      { weekday: 5, start_minute: 540, end_minute: 590 },
    ]);
    expect(sessionMeetings(at("TR", "11:00", "12:15")).map((meeting) => meeting.weekday)).toEqual([2, 4]);
  });

  it("reads single days, Saturday and Sunday", () => {
    expect(sessionMeetings(at("R"))).toEqual([{ weekday: 4, start_minute: 540, end_minute: 590 }]);
    expect(sessionMeetings(at("S")).map((meeting) => meeting.weekday)).toEqual([6]);
    expect(sessionMeetings(at("U")).map((meeting) => meeting.weekday)).toEqual([7]);
  });

  it("ignores spaces and repeated letters", () => {
    expect(sessionMeetings(at(" M W ")).map((meeting) => meeting.weekday)).toEqual([1, 3]);
    expect(sessionMeetings(at("MWM")).map((meeting) => meeting.weekday)).toEqual([1, 3]);
    expect(sessionMeetings(at("M", " 09:00 ", "09:50 "))).toHaveLength(1);
  });

  it("gives nothing for TBA, blank or unreadable days and times", () => {
    expect(sessionMeetings(at("", "TBA", "TBA"))).toEqual([]);
    expect(sessionMeetings(at("TBA"))).toEqual([]);
    expect(sessionMeetings({})).toEqual([]);
    expect(sessionMeetings(at("mw"))).toEqual([]);
    expect(sessionMeetings(at("MX"))).toEqual([]);
    expect(sessionMeetings(at("M", "9:00", "9:50"))).toEqual([]);
    expect(sessionMeetings(at("M", "24:00", "24:50"))).toEqual([]);
    // Ending before it starts, or at the same time.
    expect(sessionMeetings(at("M", "10:00", "09:00"))).toEqual([]);
    expect(sessionMeetings(at("M", "10:00", "10:00"))).toEqual([]);
  });

  it("says when a session meets, or null when it isn't set", () => {
    expect(sessionWhen(at("MWF"))).toBe("Mon, Wed, Fri 09:00–09:50");
    expect(sessionWhen(at("", "TBA", "TBA"))).toBeNull();
  });
});

describe("sectionOptions: what the picker lists", () => {
  const sections: ResisSection[] = [
    { crn: "30003", section: "E1", sessions: [at("W", "16:00", "16:50", "Recitation")], connected_crns: ["30002"] },
    { crn: "30010", section: "10", sessions: [at("M")], instructors: ["  Test   Instructor "] },
    {
      crn: "30002",
      section: "2",
      sessions: [at("TR", "11:00", "12:15")],
      instructors: ["Test Instructor"],
      connected_crns: ["30003", "40020"],
      connected_labels: ["XYZ 201L · Section L1 · Lab · CRN 40020"],
    },
    { crn: "30004", section: "3", sessions: [at("", "TBA", "TBA")] },
  ];

  it("lists lecture sections first, each kind in number order, with their sessions, types and instructors", () => {
    const options = sectionOptions(sections);
    expect(options.map((option) => option.section)).toEqual(["2", "3", "10", "E1"]);
    expect(options[0]).toMatchObject({
      crn: "30002",
      types: ["Lecture"],
      instructors: ["Test Instructor"],
      sessions: [{ when: "Tue, Thu 11:00–12:15", type: "Lecture", location: "Test Hall", instructor: "Test Instructor" }],
    });
    expect(options[1].sessions[0].when).toBeNull();
    expect(options[2].instructors).toEqual(["Test Instructor"]);
  });

  it("groups a section's linked sections by kind, with the importer's label for another course's", () => {
    const [two] = sectionOptions(sections);
    expect(two.linked).toEqual([
      {
        kind: "recitation",
        options: [
          {
            crn: "30003",
            label: "Section E1 · CRN 30003",
            sessions: [{ when: "Wed 16:00–16:50", type: "Recitation", location: "Test Hall", instructor: "Test Instructor" }],
          },
        ],
      },
      { kind: "linked section", options: [{ crn: "40020", label: "XYZ 201L · Section L1 · Lab · CRN 40020", sessions: [] }] },
    ]);
  });

  it("asks about a linked section in plain words", () => {
    const [two] = sectionOptions(sections);
    expect(linkedPrompt(two, two.linked[0])).toBe("Section 2's recitation, CRN 30003, is linked to it. Add it too?");
    expect(
      linkedPrompt(two, { kind: "lab", options: [{ crn: "1", label: "", sessions: [] }, { crn: "2", label: "", sessions: [] }] }),
    ).toBe("Section 2 has 2 linked lab sections. Add one?");
  });

  it("counts sections for the course search", () => {
    expect(sectionCountLabel(12)).toBe("12 sections");
    expect(sectionCountLabel(1)).toBe("1 section");
  });
});

describe("chosenCrns", () => {
  it("keeps the section first, then its linked CRNs, once each, dropping anything that isn't a CRN", () => {
    expect(chosenCrns("30002", ["30003", "30002", " 40020 ", "abc", ""])).toEqual(["30002", "30003", "40020"]);
    expect(chosenCrns("", [])).toEqual([]);
  });
});
