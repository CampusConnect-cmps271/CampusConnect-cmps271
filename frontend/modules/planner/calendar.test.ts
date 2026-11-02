import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarRange,
  classWeekLabel,
  formatEventWhen,
  formatItemWhen,
  formatWeekRange,
  itemWindow,
  mondayOf,
  parseCalendarDate,
  pickWeek,
  weekDates,
  weekEntries,
} from "./calendar";
import { calendarSlots, detectConflicts } from "./conflicts";
import { FIXTURE_COURSES, FIXTURE_PLAN } from "./fixtures";
import type { PlanDetails, PlannerEvent } from "./types";

// Spring 2026-27: classes run Wed 13 Jan to Tue 27 Apr 2027.
const SPRING = { starts_on: "2027-01-13", ends_on: "2027-04-27" };

describe("calendar dates", () => {
  it("finds the Monday of any day's week", () => {
    expect(mondayOf("2027-01-13")).toBe("2027-01-11");
    expect(mondayOf("2027-01-11")).toBe("2027-01-11");
    expect(mondayOf("2027-01-17")).toBe("2027-01-11");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });

  it("accepts only real calendar dates", () => {
    expect(parseCalendarDate("2027-02-28")).toBe("2027-02-28");
    expect(parseCalendarDate("2027-02-29")).toBeNull();
    expect(parseCalendarDate("2027-2-1")).toBeNull();
    expect(parseCalendarDate(undefined)).toBeNull();
  });

  it("gives own items 30 days either side of the classes", () => {
    expect(itemWindow(SPRING)).toEqual({ first: "2026-12-14", last: "2027-05-27" });
  });

  it("spans the classes' weeks, stretched to reach anything on the calendar", () => {
    expect(calendarRange(SPRING, [])).toEqual({ first: "2027-01-11", last: "2027-04-26" });
    expect(calendarRange(SPRING, ["2027-05-12", "2027-02-01"])).toEqual({ first: "2027-01-11", last: "2027-05-10" });
    expect(calendarRange(SPRING, ["2026-12-20"])).toEqual({ first: "2026-12-14", last: "2027-04-26" });
  });

  it("lists a week's seven dates, Monday first", () => {
    expect(weekDates("2027-03-22")).toEqual(["2027-03-22", "2027-03-23", "2027-03-24", "2027-03-25", "2027-03-26", "2027-03-27", "2027-03-28"]);
    expect(addDays("2027-02-27", 2)).toBe("2027-03-01");
  });
});

describe("pickWeek", () => {
  const range = calendarRange(SPRING, []);

  it("shows the requested week when it is in range, from any of its days", () => {
    expect(pickWeek("2027-02-17", "2027-03-01", SPRING, range)).toBe("2027-02-15");
  });

  it("falls back to this week, then the first week of classes", () => {
    expect(pickWeek("2030-01-01", "2027-03-03", SPRING, range)).toBe("2027-03-01");
    expect(pickWeek("not a date", "2027-03-03", SPRING, range)).toBe("2027-03-01");
    expect(pickWeek(undefined, "2026-10-31", SPRING, range)).toBe("2027-01-11");
    expect(pickWeek(["2027-04-26", "2027-01-11"], "2026-10-31", SPRING, range)).toBe("2027-04-26");
  });
});

describe("week labels", () => {
  it("numbers the weeks of classes and names the weeks outside them", () => {
    expect(classWeekLabel("2027-01-11", SPRING)).toBe("Week 1 of classes");
    expect(classWeekLabel("2027-02-15", SPRING)).toBe("Week 6 of classes");
    expect(classWeekLabel("2027-04-26", SPRING)).toBe("Week 16 of classes");
    expect(classWeekLabel("2027-01-04", SPRING)).toBe("Before classes start");
    expect(classWeekLabel("2027-05-03", SPRING)).toBe("After classes end");
  });

  it("writes the week's dates compactly", () => {
    expect(formatWeekRange("2027-02-15")).toBe("15–21 Feb 2027");
    expect(formatWeekRange("2027-03-29")).toBe("29 Mar – 4 Apr 2027");
    expect(formatWeekRange("2026-12-28")).toBe("28 Dec 2026 – 3 Jan 2027");
  });
});

describe("weekEntries", () => {
  const [fix201] = FIXTURE_COURSES;
  const plan: PlanDetails = {
    ...FIXTURE_PLAN,
    items: [
      { id: "i-exam", plan_id: FIXTURE_PLAN.id, plan_course_id: fix201.plan_course_id, title: "FIX 201 midterm", on_date: "2027-02-15", start_minute: 600, end_minute: 660, },
      { id: "i-due", plan_id: FIXTURE_PLAN.id, plan_course_id: null, title: "Essay due", on_date: "2027-02-17", start_minute: null, end_minute: null },
    ],
  };
  // Wed 17 Feb 2027, 13:00-15:00 Beirut: after FIX 203 ends at 12:45.
  const events: PlannerEvent[] = [
    { id: "e-fair", title: "Career fair", starts_at: "2027-02-17T11:00:00Z", ends_at: "2027-02-17T13:00:00Z", location: "West Hall", going: true },
  ];
  const input = { ...plan, events };
  const days = weekEntries({ plan, events, slots: calendarSlots(input), report: detectConflicts(input), monday: "2027-02-15" });

  it("puts classes, items and events on their days, all-day items first", () => {
    expect(days.map((entries) => entries.map((entry) => entry.label))).toEqual([
      ["FIX 201", "FIX 201 midterm", "FIX 202"],
      ["FIX 205"],
      ["Essay due", "FIX 201", "FIX 203", "Career fair"],
      [],
      [],
      [],
      [],
    ]);
    expect(days[2][0]).toMatchObject({ kind: "item", start_minute: null, href: "#item-i-due" });
    expect(days[2][3]).toMatchObject({ kind: "event", start_minute: 780, end_minute: 900, href: "#event-e-fair" });
    expect(days[0][1]).toMatchObject({ kind: "item", detail: "FIX 201" });
  });

  it("marks what overlaps on that date", () => {
    const monday = Object.fromEntries(days[0].map((entry) => [entry.label, entry.conflict]));
    expect(monday).toEqual({ "FIX 201": true, "FIX 201 midterm": true, "FIX 202": true });
    expect(days[2].find((entry) => entry.label === "FIX 203")?.conflict).toBe(false);
  });
});

describe("when things happen, in words", () => {
  it("gives an event's Beirut date and times, in full when it spans days", () => {
    expect(formatEventWhen({ starts_at: "2027-02-17T11:00:00Z", ends_at: "2027-02-17T13:00:00Z" })).toBe("Wed, 17 Feb 2027 · 13:00–15:00");
    expect(formatEventWhen({ starts_at: "2027-02-19T20:00:00Z", ends_at: "2027-02-20T00:30:00Z" })).toBe(
      "Fri, 19 Feb 2027 22:00 – Sat, 20 Feb 2027 02:30",
    );
  });

  it("gives an item's date and times, or all day", () => {
    expect(formatItemWhen({ on_date: "2027-03-02", start_minute: 600, end_minute: 660 })).toBe("Tue, 2 Mar 2027 · 10:00–11:00");
    expect(formatItemWhen({ on_date: "2027-03-02", start_minute: null, end_minute: null })).toBe("Tue, 2 Mar 2027 · all day");
  });
});
