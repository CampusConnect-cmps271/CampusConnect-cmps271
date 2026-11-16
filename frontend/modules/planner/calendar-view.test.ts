import { describe, expect, it } from "vitest";
import { calendarEntries, type CalendarDataEntry, type SavedCalendarEvent } from "./calendar-data";
import { buildCalendarView, calendarOverlaps, calendarRangeFor, parseCalendarParams, type CalendarData } from "./calendar-view";
import { FIXTURE_PLAN } from "./fixtures";
import type { PlanDetails } from "./types";

// Synthetic plans, sections and events; not AUB's schedule. February 2027 is
// UTC+2 in Beirut; from Sunday 28 March 2027 it is UTC+3.

/** A timed entry between two instants. */
function timed(id: string, kind: CalendarDataEntry["kind"], starts_at: string, ends_at: string, extra: Partial<CalendarDataEntry> = {}): CalendarDataEntry {
  return {
    kind,
    id,
    title: id,
    starts_at,
    ends_at,
    all_day_date: null,
    slices: [],
    plan_id: null,
    href: `/x/${id}`,
    anchor: null,
    side: null,
    ...extra,
  };
}

const ids = (overlaps: ReturnType<typeof calendarOverlaps>["overlaps"]) => overlaps.map((overlap) => [overlap.first.id, overlap.second.id]);

describe("calendarOverlaps", () => {
  // Tue 16 Feb 2027, 10:00-11:15 Beirut.
  const at = (start: string, end: string) => [`2027-02-16T${start}:00Z`, `2027-02-16T${end}:00Z`] as const;
  const klass = timed("CMPS 202", "class", ...at("08:00", "09:15"));

  it("warns for every pair of what the student has committed to: classes, timed items and going events", () => {
    const other = timed("MATH 201", "class", ...at("09:00", "10:00"));
    const item = timed("Quiz", "item", ...at("09:10", "09:30"));
    const going = timed("Career fair", "event", ...at("09:05", "09:20"), { going: true });
    const { overlaps } = calendarOverlaps([klass, other, item, going]);
    expect(ids(overlaps).map((pair) => [...pair].sort().join(" + ")).sort()).toEqual(
      [
        "CMPS 202 + MATH 201",
        "CMPS 202 + Quiz",
        "CMPS 202 + Career fair",
        "MATH 201 + Quiz",
        "Career fair + MATH 201",
        "Career fair + Quiz",
      ]
        .map((pair) => pair.split(" + ").sort().join(" + "))
        .sort(),
    );
    const classAndEvent = overlaps.find((overlap) => [overlap.first.id, overlap.second.id].includes("Career fair") && [overlap.first.id, overlap.second.id].includes("CMPS 202"));
    expect(classAndEvent).toMatchObject({ starts_at: "2027-02-16T09:05:00.000Z", ends_at: "2027-02-16T09:15:00.000Z" });
  });

  it("uses half-open times: ending at 10:45 and starting at 10:45 don't clash", () => {
    const after = timed("Quiz", "item", ...at("09:15", "10:00"));
    expect(calendarOverlaps([klass, after]).overlaps).toEqual([]);
  });

  it("gives a saved event the student isn't going to a quiet note, not a warning", () => {
    const saved = timed("Talk", "event", ...at("09:00", "10:00"), { going: false });
    const { overlaps, clashes } = calendarOverlaps([klass, saved]);
    expect(overlaps).toEqual([]);
    expect(clashes.get("Talk")).toEqual(["CMPS 202"]);
  });

  it("never counts cancelled events, reminders or all-day items", () => {
    const cancelled = timed("Gala", "event", ...at("08:30", "09:00"), { going: true, cancelled: true });
    const cancelledSaved = timed("Old talk", "event", ...at("08:30", "09:00"), { going: false, cancelled: true });
    const reminder = timed("Reminder: Gala", "reminder", ...at("08:30", "08:30"));
    const allDay = { ...timed("Essay due", "item", "", ""), starts_at: null, ends_at: null, all_day_date: "2027-02-16" };
    const { overlaps, clashes } = calendarOverlaps([klass, cancelled, cancelledSaved, reminder, allDay]);
    expect(overlaps).toEqual([]);
    expect(clashes.size).toBe(0);
  });
});

describe("parseCalendarParams and calendarRangeFor", () => {
  it("reads the view and date from the URL, falling back to today's day view", () => {
    expect(parseCalendarParams({ view: "week", date: "2027-02-17" }, "2026-11-16")).toEqual({ view: "week", date: "2027-02-17" });
    expect(parseCalendarParams({ view: ["today"], date: ["2027-02-30"] }, "2026-11-16")).toEqual({ view: "today", date: "2026-11-16" });
    expect(parseCalendarParams({ view: "month" }, "2026-11-16")).toEqual({ view: "today", date: "2026-11-16" });
  });

  it("shows one day, or Monday to Sunday of the date's week", () => {
    expect(calendarRangeFor("today", "2027-02-17")).toEqual({ from: "2027-02-17", to: "2027-02-17" });
    expect(calendarRangeFor("week", "2027-02-17")).toEqual({ from: "2027-02-15", to: "2027-02-21" });
    expect(calendarRangeFor("week", "2027-02-21")).toEqual({ from: "2027-02-15", to: "2027-02-21" });
  });
});

const sectionPlan: PlanDetails = {
  ...FIXTURE_PLAN,
  courses: [
    {
      plan_course_id: "pc-1",
      course_id: "c-1",
      position: 1,
      code: "SEC 202",
      name: "Section course",
      credits: "3",
      sections: [{ crn: "30001", section: "L1", semester_id: "202720" }],
      meetings: [
        { id: "m-tue", plan_course_id: "pc-1", weekday: 2, start_minute: 660, end_minute: 735, timezone: "Asia/Beirut", source: "resis", crn: "30001" },
        { id: "m-mon", plan_course_id: "pc-1", weekday: 1, start_minute: 540, end_minute: 590, timezone: "Asia/Beirut", source: "resis", crn: "30001" },
      ],
    },
  ],
  items: [{ id: "i-due", plan_id: FIXTURE_PLAN.id, plan_course_id: null, title: "Essay due", on_date: "2027-02-16", start_minute: null, end_minute: null }],
};

const savedEvent = (id: string, starts_at: string, ends_at: string, extra: Partial<SavedCalendarEvent> = {}): SavedCalendarEvent => ({
  id,
  title: id,
  starts_at,
  ends_at,
  location: "West Hall",
  going: true,
  cancelled: false,
  reminder_enabled: false,
  reminder_minutes_before: 60,
  ...extra,
});

function view(args: { view: "today" | "week"; date: string; now: string; plans?: PlanDetails[]; events?: SavedCalendarEvent[]; totals?: CalendarData["totals"] }) {
  const plans = args.plans ?? [sectionPlan];
  const events = args.events ?? [];
  const { from, to } = calendarRangeFor(args.view, args.date);
  const details = new Map([
    ["30001", { crn: "30001", section: "L1", sessions: [{ days: "MT", start: "09:00", end: "09:50", type: "Lecture", location: "Bliss 205" }, { days: "T", start: "11:00", end: "12:15", type: "Lecture", location: "Bliss 205" }] }],
  ]);
  const data: CalendarData = {
    entries: calendarEntries({ plans, events, from, to, details }),
    plans: plans.map(({ id, term, starts_on, ends_on }) => ({ id, term, starts_on, ends_on })),
    totals: args.totals ?? { plans: plans.length, savedEvents: events.length },
  };
  return buildCalendarView({ view: args.view, date: args.date, today: args.now.slice(0, 10), now: new Date(args.now), data });
}

describe("buildCalendarView: Today", () => {
  // Tue 16 Feb 2027 at 12:00 Beirut.
  const NOW = "2027-02-16T10:00:00Z";

  it("lists one Beirut day, all-day items first, then in time order, each saying what it is", () => {
    const model = view({
      view: "today",
      date: "2027-02-16",
      now: NOW,
      events: [savedEvent("Career fair", "2027-02-16T09:30:00Z", "2027-02-16T11:00:00Z", { reminder_enabled: true, reminder_minutes_before: 30 })],
    });
    expect(model.days).toHaveLength(1);
    expect(model.days[0].entries.map((entry) => [entry.time, entry.title, entry.kindLabel])).toEqual([
      ["All day", "Essay due", "Your item"],
      ["11:00", "Reminder: Career fair at 11:30", "Reminder"],
      ["11:00–12:15", "SEC 202", "Class"],
      ["11:30–13:00", "Career fair", "Event (going)"],
    ]);
    expect(model.days[0].entries[2].details).toEqual(["Section L1", "Lecture", "Bliss 205"]);
    expect(model.days[0].entries[2].href).toBe(`/planner/${FIXTURE_PLAN.id}#meeting-m-tue`);
    expect(model.days[0].entries[3].href).toBe("/events/Career fair");
  });

  it("warns about a going event during a class, naming both and the overlapping time", () => {
    const model = view({ view: "today", date: "2027-02-16", now: NOW, events: [savedEvent("Career fair", "2027-02-16T09:30:00Z", "2027-02-16T11:00:00Z")] });
    expect(model.overlaps).toEqual([
      {
        key: "class:m-tue:2027-02-16|event:Career fair",
        first: { title: "SEC 202", kindLabel: "Class", href: `/planner/${FIXTURE_PLAN.id}#meeting-m-tue` },
        second: { title: "Career fair", kindLabel: "Event (going)", href: "/events/Career fair" },
        when: "Tue, 16 Feb 2027, 11:30–12:15",
      },
    ]);
    expect(model.days[0].entries.filter((entry) => entry.overlap).map((entry) => entry.title)).toEqual(["SEC 202", "Career fair"]);
    expect(model.counts.overlaps).toBe(1);
  });

  it("shows a saved-only clash as a note, and a cancelled event as cancelled with no reminder", () => {
    const model = view({
      view: "today",
      date: "2027-02-16",
      now: NOW,
      events: [
        savedEvent("Talk", "2027-02-16T09:30:00Z", "2027-02-16T10:00:00Z", { going: false }),
        savedEvent("Gala", "2027-02-16T09:00:00Z", "2027-02-16T10:00:00Z", { cancelled: true, reminder_enabled: true }),
      ],
    });
    expect(model.overlaps).toEqual([]);
    const talk = model.days[0].entries.find((entry) => entry.title === "Talk");
    expect(talk).toMatchObject({ kind: "saved", kindLabel: "Event (saved)", overlap: false, note: "Clashes with SEC 202" });
    expect(model.days[0].entries.find((entry) => entry.title === "Gala")).toMatchObject({ kind: "cancelled", kindLabel: "Event (cancelled)" });
    expect(model.days[0].entries.some((entry) => entry.kind === "reminder")).toBe(false);
  });

  it("shows the Now line and what's next while something is still ahead", () => {
    const model = view({ view: "today", date: "2027-02-16", now: NOW });
    expect(model.nowMinute).toBe(720);
    expect(model.next).toBeNull();
    const morning = view({ view: "today", date: "2027-02-16", now: "2027-02-16T07:00:00Z" });
    expect(morning.next).toEqual({ title: "SEC 202", time: "11:00" });
    expect(morning.nowMinute).toBe(540);
    // Another day has no Now line and no "Next".
    const other = view({ view: "today", date: "2027-02-15", now: NOW });
    expect(other.nowMinute).toBeNull();
    expect(other.next).toBeNull();
  });

  it("moves a day at a time, with Today going back to Beirut's today", () => {
    const model = view({ view: "today", date: "2027-02-15", now: NOW });
    expect(model.nav.previous.href).toBe("/calendar?view=today&date=2027-02-14");
    expect(model.nav.next.href).toBe("/calendar?view=today&date=2027-02-16");
    expect(model.nav.current).toEqual({ href: "/calendar?view=today&date=2027-02-16", label: "Today", here: false });
  });
});

describe("buildCalendarView: This Week", () => {
  it("shows Monday to Sunday and moves a week at a time", () => {
    const model = view({ view: "week", date: "2027-02-17", now: "2027-02-16T10:00:00Z" });
    expect(model.days.map((day) => day.date)).toEqual(["2027-02-15", "2027-02-16", "2027-02-17", "2027-02-18", "2027-02-19", "2027-02-20", "2027-02-21"]);
    expect(model.rangeLabel).toBe("15–21 Feb 2027");
    expect(model.days[1].today).toBe(true);
    expect(model.nav.previous.href).toBe("/calendar?view=week&date=2027-02-08");
    expect(model.nav.next.href).toBe("/calendar?view=week&date=2027-02-22");
    expect(model.nav.current).toMatchObject({ label: "This week", here: true });
    expect(model.days[0].entries.map((entry) => entry.time)).toEqual(["09:00–09:50"]);
  });

  it("keeps classes in Beirut time across the daylight-saving change, where an event's UTC time shifts", () => {
    // 06:15 UTC is 08:15 in Beirut on 22 March and 09:15 on 29 March, after the change.
    const events = [
      savedEvent("Before", "2027-03-22T06:15:00Z", "2027-03-22T06:45:00Z"),
      savedEvent("After", "2027-03-29T06:15:00Z", "2027-03-29T06:45:00Z"),
    ];
    const before = view({ view: "week", date: "2027-03-22", now: "2027-03-22T10:00:00Z", events });
    const after = view({ view: "week", date: "2027-03-29", now: "2027-03-29T10:00:00Z", events });
    expect(before.days[0].entries.map((entry) => [entry.title, entry.time])).toEqual([["Before", "08:15–08:45"], ["SEC 202", "09:00–09:50"]]);
    expect(before.overlaps).toEqual([]);
    expect(after.days[0].entries.map((entry) => [entry.title, entry.time])).toEqual([["SEC 202", "09:00–09:50"], ["After", "09:15–09:45"]]);
    expect(after.overlaps.map((overlap) => overlap.when)).toEqual(["Mon, 29 Mar 2027, 09:15–09:45"]);
  });

  it("takes each day's classes from the plan whose term covers it, in a week two terms share", () => {
    const first: PlanDetails = { ...sectionPlan, id: "first", starts_on: "2027-01-13", ends_on: "2027-02-17", items: [] };
    const second: PlanDetails = {
      ...sectionPlan,
      id: "second",
      term: "Summer 2027",
      starts_on: "2027-02-18",
      ends_on: "2027-04-27",
      items: [],
      courses: [{ ...sectionPlan.courses[0], plan_course_id: "pc-2", code: "SUM 101", sections: [], meetings: [{ id: "m-fri", plan_course_id: "pc-2", weekday: 5, start_minute: 600, end_minute: 650, timezone: "Asia/Beirut", source: "manual" }] }],
    };
    const model = view({ view: "week", date: "2027-02-15", now: "2027-02-15T10:00:00Z", plans: [first, second] });
    const byDay = model.days.map((day) => day.entries.map((entry) => entry.title).join(","));
    expect(byDay).toEqual(["SEC 202", "SEC 202", "", "", "SUM 101", "", ""]);
    expect(model.days[4].entries[0].details).toEqual(["Typed by you, tentative"]);
    expect(model.noPlanCovers).toBe(false);
  });

  it("says when no plan covers the week, and still shows events and items", () => {
    const model = view({
      view: "week",
      date: "2027-06-07",
      now: "2027-06-07T10:00:00Z",
      events: [savedEvent("Summer fair", "2027-06-08T09:00:00Z", "2027-06-08T10:00:00Z")],
    });
    expect(model.noPlanCovers).toBe(true);
    expect(model.days.flatMap((day) => day.entries.map((entry) => entry.title))).toEqual(["Summer fair"]);
    expect(model.empty).toBeNull();
  });

  it("tells an empty week from a student with nothing at all", () => {
    expect(view({ view: "week", date: "2027-06-07", now: "2027-06-07T10:00:00Z" }).empty).toBe("range");
    expect(view({ view: "week", date: "2027-06-07", now: "2027-06-07T10:00:00Z", plans: [], totals: { plans: 0, savedEvents: 0 } }).empty).toBe("nothing");
  });
});

describe("day boundaries at Beirut midnight, whatever the machine's zone", () => {
  // 21:30-22:30 UTC on 16 Feb is 23:30-00:30 in Beirut; 22:00 UTC is midnight.
  const events = [
    savedEvent("Late talk", "2027-02-16T21:30:00Z", "2027-02-16T22:30:00Z"),
    savedEvent("Midnight start", "2027-02-17T00:00:00Z", "2027-02-17T01:00:00Z", { reminder_enabled: true, reminder_minutes_before: 120 }),
  ];

  it("splits an event that runs past Beirut midnight across both days", () => {
    const tuesday = view({ view: "today", date: "2027-02-16", now: "2027-02-16T10:00:00Z", plans: [], events });
    const wednesday = view({ view: "today", date: "2027-02-17", now: "2027-02-16T10:00:00Z", plans: [], events });
    expect(tuesday.days[0].entries.map((entry) => [entry.title, entry.time])).toEqual([["Late talk", "23:30–24:00"]]);
    // At the same start, a moment (the reminder) comes before a stretch.
    expect(wednesday.days[0].entries.map((entry) => [entry.title, entry.time])).toEqual([
      ["Reminder: Midnight start at 02:00", "00:00"],
      ["Late talk", "00:00–00:30"],
      ["Midnight start", "02:00–03:00"],
    ]);
  });

  it("dates Beirut's today and the Now line by Beirut's clock", () => {
    // 22:30 UTC on 16 Feb is already 00:30 on 17 Feb in Beirut.
    const model = view({ view: "today", date: "2027-02-17", now: "2027-02-16T22:30:00Z", plans: [], events });
    expect(model.nowMinute).toBe(30);
    expect(model.next).toEqual({ title: "Midnight start", time: "02:00" });
  });
});
