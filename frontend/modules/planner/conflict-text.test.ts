import { describe, expect, it } from "vitest";
import type { ConflictReport, ScheduleConflict } from "./conflicts";
import { conflictHeadline, invalidItemHelp, invalidMeetingHelp, overlapDates, overlapWindow } from "./conflict-text";

const side = { kind: "meeting" as const, meeting_id: "m", plan_course_id: "pc", course_id: "c" };
const report = (fields: Partial<ConflictReport>): ConflictReport => ({
  status: "clear",
  conflicts: [],
  unknown: [],
  invalid: [],
  ...fields,
});
const conflict = (fields: Partial<ScheduleConflict>): ScheduleConflict => ({
  sides: [side, side],
  weekday: 2,
  start_minute: 600,
  end_minute: 645,
  every_week: true,
  dates: ["2027-01-19"],
  ...fields,
});

describe("conflictHeadline", () => {
  it("names each state differently", () => {
    expect(conflictHeadline(report({ status: "empty" }))).toBe("No courses to check yet");
    expect(conflictHeadline(report({ status: "clear" }))).toBe("No conflicts among the times you entered");
    expect(conflictHeadline(report({ status: "conflicts", conflicts: [conflict({}), conflict({})] }))).toBe("2 conflicts found");
    expect(conflictHeadline(report({ status: "conflicts", conflicts: [conflict({})] }))).toBe("1 conflict found");
  });

  it("never says no conflicts when something couldn't be checked", () => {
    const unknown = [{ plan_course_id: "a", course_id: "a" }, { plan_course_id: "b", course_id: "b" }];
    const invalid = [{ ...side, reason: "bad_range" as const, dates: [] }];
    expect(conflictHeadline(report({ status: "incomplete", unknown }))).toBe(
      "No overlaps among the times you entered, but 2 courses have no times",
    );
    expect(conflictHeadline(report({ status: "incomplete", unknown: unknown.slice(1), invalid }))).toBe(
      "No overlaps among the times you entered, but 1 course has no times and 1 meeting needs fixing",
    );
  });
});

describe("overlap wording", () => {
  it("gives the window in Beirut time", () => {
    expect(overlapWindow(conflict({}))).toBe("Tuesday 10:00–10:45");
    expect(overlapWindow(conflict({ weekday: 6, start_minute: 1410, end_minute: 1470 }))).toBe("Saturday 23:30–00:30 the next day");
  });

  it("says every week, or which dates", () => {
    expect(overlapDates(conflict({}))).toBe("every week");
    expect(overlapDates(conflict({ every_week: false, dates: ["2026-10-26"] }))).toBe("only on Mon, 26 Oct 2026");
    expect(overlapDates(conflict({ every_week: false, dates: ["2027-03-15", "2027-03-22"] }))).toBe(
      "only on Mon, 15 Mar 2027 and Mon, 22 Mar 2027",
    );
    expect(
      overlapDates(conflict({ every_week: false, dates: ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"] })),
    ).toBe("on 5 dates, from Mon, 2 Nov 2026 to Mon, 30 Nov 2026");
  });
});

describe("invalidMeetingHelp", () => {
  const term = { starts_on: "2027-05-26", ends_on: "2027-05-28" };

  it("says what to fix for each reason", () => {
    expect(invalidMeetingHelp({ ...side, reason: "bad_range", dates: [] }, undefined, term)).toMatch(/must end after it starts/);
    expect(
      invalidMeetingHelp({ ...side, reason: "unknown_timezone", dates: [] }, { weekday: 1, start_minute: 0, timezone: "Mars/Base" }, term),
    ).toMatch(/“Mars\/Base” isn't a time zone/);
    expect(
      invalidMeetingHelp({ ...side, reason: "no_dates_in_term", dates: [] }, { weekday: 1, start_minute: 0, timezone: "Asia/Beirut" }, term),
    ).toBe("Monday never falls between Wed, 26 May 2027 and Fri, 28 May 2027, so it never meets this term. Change its day.");
    expect(
      invalidMeetingHelp(
        { ...side, reason: "starts_in_dst_gap", dates: ["2027-03-28"] },
        { weekday: 7, start_minute: 30, timezone: "Asia/Beirut" },
        term,
      ),
    ).toBe("00:30 doesn't exist on Sun, 28 Mar 2027 in Asia/Beirut: the clocks go forward an hour. Move its start time.");
  });
});

describe("own items", () => {
  const itemSide = { kind: "item" as const, item_id: "i" };

  it("counts meetings and items to fix separately", () => {
    const invalid = [
      { ...side, reason: "bad_range" as const, dates: [] },
      { ...itemSide, reason: "bad_range" as const, dates: [] },
      { ...itemSide, reason: "starts_in_dst_gap" as const, dates: ["2027-03-28"] },
    ];
    expect(conflictHeadline(report({ status: "incomplete", invalid }))).toBe(
      "No overlaps among the times you entered, but 1 meeting needs fixing and 2 items need fixing",
    );
  });

  it("says what to fix on an item", () => {
    expect(invalidItemHelp({ ...itemSide, reason: "bad_range", dates: [] }, { start_minute: 600 })).toMatch(/must end after it starts/);
    expect(invalidItemHelp({ ...itemSide, reason: "starts_in_dst_gap", dates: ["2027-03-28"] }, { start_minute: 30 })).toBe(
      "00:30 doesn't exist on Sun, 28 Mar 2027 in Beirut: the clocks go forward an hour. Move its start time.",
    );
  });
});
