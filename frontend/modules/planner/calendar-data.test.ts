import { describe, expect, it } from "vitest";
import { calendarEntries, reminderEntry, type SavedCalendarEvent } from "./calendar-data";
import { FIXTURE_PLAN } from "./fixtures";
import type { PlanDetails } from "./types";

// Synthetic plans and events: not AUB's schedule. Spring 2026-27's official
// dates span Beirut's spring daylight-saving change (Sunday 28 March 2027).
const plan: PlanDetails = {
  ...FIXTURE_PLAN,
  courses: [
    {
      plan_course_id: "pc-1",
      course_id: "c-1",
      position: 1,
      code: "SEC 201",
      name: "Section course",
      credits: "3",
      sections: [{ crn: "30001", section: "1", semester_id: "202720" }],
      meetings: [
        { id: "m-mon", plan_course_id: "pc-1", weekday: 1, start_minute: 540, end_minute: 590, timezone: "Asia/Beirut", source: "resis", crn: "30001" },
      ],
    },
    {
      plan_course_id: "pc-2",
      course_id: "c-2",
      position: 2,
      code: "TYP 202",
      name: "Typed course",
      credits: "3",
      meetings: [{ id: "m-tue", plan_course_id: "pc-2", weekday: 2, start_minute: 600, end_minute: 675, timezone: "Asia/Beirut", source: "manual" }],
    },
  ],
  items: [
    { id: "i-quiz", plan_id: FIXTURE_PLAN.id, plan_course_id: "pc-2", title: "Quiz", on_date: "2027-03-24", start_minute: 720, end_minute: 750 },
    { id: "i-due", plan_id: FIXTURE_PLAN.id, plan_course_id: null, title: "Essay due", on_date: "2027-03-30", start_minute: null, end_minute: null },
  ],
};

const event = (id: string, starts_at: string, ends_at: string, extra: Partial<SavedCalendarEvent> = {}): SavedCalendarEvent => ({
  id,
  title: `Event ${id}`,
  starts_at,
  ends_at,
  location: "West Hall",
  going: false,
  cancelled: false,
  reminder_enabled: false,
  reminder_minutes_before: 60,
  ...extra,
});

describe("calendarEntries", () => {
  const entries = calendarEntries({
    plans: [plan],
    events: [
      event("talk", "2027-03-23T15:00:00Z", "2027-03-23T16:00:00Z", { going: true, reminder_enabled: true, reminder_minutes_before: 30 }),
      event("gone", "2027-03-25T15:00:00Z", "2027-03-25T16:00:00Z", { cancelled: true, reminder_enabled: true }),
      event("later", "2027-05-01T15:00:00Z", "2027-05-01T16:00:00Z", { reminder_enabled: true }),
    ],
    from: "2027-03-22",
    to: "2027-04-04",
  });
  const ids = entries.map((entry) => entry.id);

  it("places a class on its weekdays across the daylight-saving change, in Beirut time", () => {
    const mondays = entries.filter((entry) => entry.id.startsWith("class:m-mon"));
    expect(mondays.map((entry) => [entry.starts_at, entry.ends_at])).toEqual([
      ["2027-03-22T07:00:00.000Z", "2027-03-22T07:50:00.000Z"],
      // Beirut moved to UTC+3 on 28 March: the same 09:00 is an hour earlier in UTC.
      ["2027-03-29T06:00:00.000Z", "2027-03-29T06:50:00.000Z"],
    ]);
    expect(mondays.map((entry) => entry.slices)).toEqual([
      [{ date: "2027-03-22", start_minute: 540, end_minute: 590 }],
      [{ date: "2027-03-29", start_minute: 540, end_minute: 590 }],
    ]);
  });

  it("says where a class's times come from, and links each entry to its page", () => {
    const sectionClass = entries.find((entry) => entry.id === "class:m-mon:2027-03-22");
    expect(sectionClass).toMatchObject({
      kind: "class",
      title: "SEC 201",
      source: "resis",
      crn: "30001",
      plan_id: FIXTURE_PLAN.id,
      href: `/planner/${FIXTURE_PLAN.id}#meeting-m-mon`,
    });
    expect(entries.find((entry) => entry.id === "class:m-tue:2027-03-23")).toMatchObject({ source: "manual", crn: null, course_code: "TYP 202" });
    expect(entries.find((entry) => entry.id === "event:talk")).toMatchObject({ kind: "event", plan_id: null, href: "/events/talk", going: true, cancelled: false });
  });

  it("includes timed and all-day items, all-day ones first on their day", () => {
    expect(entries.find((entry) => entry.id === "item:i-quiz")).toMatchObject({
      kind: "item",
      course_code: "TYP 202",
      starts_at: "2027-03-24T10:00:00.000Z",
      all_day_date: null,
    });
    const tuesday30 = entries.filter((entry) => entry.all_day_date === "2027-03-30" || entry.slices.some((slice) => slice.date === "2027-03-30"));
    expect(tuesday30.map((entry) => entry.id)).toEqual(["item:i-due", "class:m-tue:2027-03-30"]);
    expect(tuesday30[0]).toMatchObject({ starts_at: null, ends_at: null, slices: [], href: `/planner/${FIXTURE_PLAN.id}#item-i-due` });
  });

  it("adds a reminder before an event that has one on, and none for a cancelled event", () => {
    expect(entries.find((entry) => entry.id === "reminder:talk")).toMatchObject({
      kind: "reminder",
      title: "Reminder: Event talk",
      starts_at: "2027-03-23T14:30:00.000Z",
      ends_at: "2027-03-23T14:30:00.000Z",
      slices: [{ date: "2027-03-23", start_minute: 990, end_minute: 990 }],
      event_id: "talk",
      href: "/events/talk",
    });
    expect(entries.find((entry) => entry.id === "event:gone")).toMatchObject({ cancelled: true });
    expect(ids).not.toContain("reminder:gone");
    expect(reminderEntry(event("off", "2027-03-23T15:00:00Z", "2027-03-23T16:00:00Z"))).toBeNull();
  });

  it("keeps only what falls in the range, in time order", () => {
    expect(ids).not.toContain("event:later");
    expect(ids).not.toContain("reminder:later");
    const starts = entries.filter((entry) => entry.starts_at).map((entry) => entry.slices[0].date + entry.starts_at);
    expect(starts).toEqual([...starts].sort());
    expect(entries.every((entry) => (entry.all_day_date ?? entry.slices[0].date) >= "2027-03-22")).toBe(true);
  });

  it("gives every entry an id that stays the same across loads", () => {
    const again = calendarEntries({ plans: [plan], events: [], from: "2027-03-22", to: "2027-04-04" }).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of again) expect(ids).toContain(id);
  });

  it("covers every plan whose term overlaps the range", () => {
    const fall: PlanDetails = { ...plan, id: "fall-plan", term: "Fall 2026", starts_on: "2026-08-31", ends_on: "2026-12-04", items: [] };
    const both = calendarEntries({ plans: [fall, plan], events: [], from: "2026-12-01", to: "2027-01-19" });
    expect([...new Set(both.filter((entry) => entry.kind === "class").map((entry) => entry.plan_id))]).toEqual(["fall-plan", FIXTURE_PLAN.id]);
    // Nothing between Fall's last class (4 Dec) and Spring's first (13 Jan).
    expect(both.some((entry) => entry.slices.some((slice) => slice.date > "2026-12-04" && slice.date < "2027-01-13"))).toBe(false);
  });
});
