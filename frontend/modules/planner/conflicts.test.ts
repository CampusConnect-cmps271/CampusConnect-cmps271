import { describe, expect, it } from "vitest";
import { detectConflicts, type ConflictInput } from "./conflicts";
import { FIXTURE_COURSES, FIXTURE_PLAN } from "./fixtures";
import type { Weekday } from "./types";

// Runs under TZ=UTC and TZ=Asia/Beirut (vitest.config.mts projects): the
// engine must give the same answers whatever the machine's zone.

const FALL_2026 = { starts_on: "2026-08-31", ends_on: "2026-12-04" };
const SPRING_2027 = { starts_on: "2027-01-13", ends_on: "2027-04-27" };

type MeetingSpec = [weekday: number, start: string, end: string, timezone?: string];

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function course(name: string, ...meetings: MeetingSpec[]) {
  return {
    plan_course_id: `pc-${name}`,
    course_id: `c-${name}`,
    meetings: meetings.map(([weekday, start, end, timezone = "Asia/Beirut"], index) => ({
      id: `m-${name}-${index + 1}`,
      weekday: weekday as Weekday,
      start_minute: minutes(start),
      end_minute: minutes(end),
      timezone,
    })),
  };
}

const plan = (term: { starts_on: string; ends_on: string }, ...courses: ConflictInput["courses"][number][]): ConflictInput => ({
  ...term,
  courses,
});

/** Dates in [from, to] falling on an ISO weekday, as YYYY-MM-DD. */
function datesOn(weekday: number, from: string, to: string): string[] {
  const dates: string[] = [];
  for (let day = Date.parse(`${from}T00:00:00Z`); day <= Date.parse(`${to}T00:00:00Z`); day += 86_400_000) {
    if (((new Date(day).getUTCDay() + 6) % 7) + 1 === weekday) dates.push(new Date(day).toISOString().slice(0, 10));
  }
  return dates;
}

/** "HH:MM" wall clock of an instant in a zone, read with Intl. */
function wallTime(zone: string, instant: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

/** Every instant on the UTC hour grid around `date` whose wall clock in `zone` reads `date time`. */
function instantsOf(zone: string, date: string, time: string): number[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const base = Date.parse(`${date}T00:00:00Z`);
  const found: number[] = [];
  for (let instant = base - 36 * 3_600_000; instant <= base + 36 * 3_600_000; instant += 15 * 60_000) {
    if (parts.format(instant).replace(",", "") === `${date} ${time}`) found.push(instant);
  }
  return found;
}

describe("the machine's time zone", () => {
  it("is the one this run was configured with", () => {
    if (process.env.TZ === "Asia/Beirut") expect(new Date("2026-01-01T00:00:00Z").getHours()).toBe(2);
    if (process.env.TZ === "UTC") expect(new Date("2026-01-01T00:00:00Z").getHours()).toBe(0);
  });
});

describe("detectConflicts: statuses", () => {
  it("calls a plan without courses empty", () => {
    expect(detectConflicts(plan(SPRING_2027))).toEqual({ status: "empty", conflicts: [], unknown: [], invalid: [] });
  });

  it("is clear only when every course has times and none overlap", () => {
    const report = detectConflicts(plan(SPRING_2027, course("a", [2, "09:30", "10:45"]), course("b", [4, "09:30", "10:45"])));
    expect(report.status).toBe("clear");
  });

  it("is incomplete, never clear, when a course has no times", () => {
    const report = detectConflicts(plan(SPRING_2027, course("a", [2, "09:30", "10:45"]), course("b")));
    expect(report.status).toBe("incomplete");
    expect(report.unknown).toEqual([{ plan_course_id: "pc-b", course_id: "c-b" }]);
  });

  it("reports conflicts first, and still lists courses without times", () => {
    const report = detectConflicts(
      plan(SPRING_2027, course("a", [2, "09:00", "10:00"]), course("b", [2, "09:30", "10:30"]), course("c")),
    );
    expect(report.status).toBe("conflicts");
    expect(report.unknown).toHaveLength(1);
  });
});

describe("detectConflicts: weekly overlaps", () => {
  const tuesdays = datesOn(2, SPRING_2027.starts_on, SPRING_2027.ends_on);

  it("finds an overlap on the same weekday, every week, with the overlapping window", () => {
    const report = detectConflicts(plan(SPRING_2027, course("a", [2, "09:30", "10:45"]), course("b", [2, "10:00", "11:15"])));
    expect(report.conflicts).toEqual([
      {
        meetings: [
          { meeting_id: "m-a-1", plan_course_id: "pc-a", course_id: "c-a" },
          { meeting_id: "m-b-1", plan_course_id: "pc-b", course_id: "c-b" },
        ],
        weekday: 2,
        start_minute: minutes("10:00"),
        end_minute: minutes("10:45"),
        every_week: true,
        dates: tuesdays,
      },
    ]);
  });

  it("ignores the same times on different weekdays", () => {
    expect(detectConflicts(plan(SPRING_2027, course("a", [2, "09:30", "10:45"]), course("b", [3, "09:30", "10:45"]))).conflicts).toEqual([]);
  });

  it("treats meetings that touch end to start as adjacent, not overlapping", () => {
    const report = detectConflicts(plan(SPRING_2027, course("a", [2, "09:30", "10:45"]), course("b", [2, "10:45", "12:00"])));
    expect(report.status).toBe("clear");
  });

  it("reports containment as the inner meeting's window", () => {
    const [conflict] = detectConflicts(plan(SPRING_2027, course("a", [1, "09:00", "12:00"]), course("b", [1, "10:00", "11:00"]))).conflicts;
    expect([conflict.start_minute, conflict.end_minute]).toEqual([600, 660]);
  });

  it("reports identical meetings in full", () => {
    const [conflict] = detectConflicts(plan(SPRING_2027, course("a", [5, "14:00", "15:15"]), course("b", [5, "14:00", "15:15"]))).conflicts;
    expect([conflict.weekday, conflict.start_minute, conflict.end_minute, conflict.every_week]).toEqual([5, 840, 915, true]);
  });

  it("reports each pair of a three-way overlap", () => {
    const report = detectConflicts(
      plan(SPRING_2027, course("a", [3, "09:00", "11:00"]), course("b", [3, "10:00", "12:00"]), course("c", [3, "10:30", "10:50"])),
    );
    expect(report.conflicts.map((conflict) => conflict.meetings.map((side) => side.course_id).join("+")).sort()).toEqual([
      "c-a+c-b",
      "c-a+c-c",
      "c-b+c-c",
    ]);
  });

  it("checks each of a course's meetings, and only reports the days that clash", () => {
    const report = detectConflicts(
      plan(SPRING_2027, course("a", [1, "09:00", "10:00"], [3, "09:00", "10:00"]), course("b", [3, "09:30", "10:30"])),
    );
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].weekday).toBe(3);
    expect(report.conflicts[0].meetings[0].meeting_id).toBe("m-a-2");
  });

  it("reports a course whose own meetings overlap", () => {
    const report = detectConflicts(plan(SPRING_2027, course("a", [4, "09:00", "10:00"], [4, "09:30", "10:30"])));
    expect(report.status).toBe("conflicts");
    expect(report.conflicts[0].meetings.map((side) => side.plan_course_id)).toEqual(["pc-a", "pc-a"]);
  });

  it("matches the fixture plan: one Monday overlap, an adjacency, a course without times", () => {
    const report = detectConflicts(FIXTURE_PLAN);
    expect(report.status).toBe("conflicts");
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].meetings.map((side) => side.course_id)).toEqual([FIXTURE_COURSES[0].course_id, FIXTURE_COURSES[1].course_id]);
    expect([report.conflicts[0].weekday, report.conflicts[0].start_minute, report.conflicts[0].end_minute]).toEqual([1, 600, 645]);
    expect(report.unknown).toEqual([{ plan_course_id: FIXTURE_COURSES[3].plan_course_id, course_id: FIXTURE_COURSES[3].course_id }]);
  });
});

describe("detectConflicts: meetings it can't place", () => {
  it("reports bad ranges", () => {
    const bad = ([weekday, start, end]: readonly [number, number, number]) => ({
      plan_course_id: "pc-x",
      course_id: "c-x",
      meetings: [{ id: "m-x", weekday: weekday as Weekday, start_minute: start, end_minute: end, timezone: "Asia/Beirut" }],
    });
    const ranges: [number, number, number][] = [[2, 600, 600], [2, 700, 600], [8, 600, 660], [0, 600, 660], [2, -5, 60], [2, 1400, 1441], [2, 600.5, 660]];
    for (const meeting of ranges) {
      const report = detectConflicts(plan(SPRING_2027, bad(meeting)));
      expect(report.status).toBe("incomplete");
      expect(report.invalid).toEqual([{ meeting_id: "m-x", plan_course_id: "pc-x", course_id: "c-x", reason: "bad_range", dates: [] }]);
    }
  });

  it("reports unknown time zones", () => {
    const report = detectConflicts(plan(SPRING_2027, course("a", [2, "09:00", "10:00", "Mars/Olympus_Mons"])));
    expect(report.invalid.map((meeting) => meeting.reason)).toEqual(["unknown_timezone"]);
  });

  it("reports a weekday that never falls in a short term", () => {
    // Wednesday 26 to Friday 28 May 2027: no Monday.
    const short = { starts_on: "2027-05-26", ends_on: "2027-05-28" };
    const report = detectConflicts(plan(short, course("a", [1, "09:00", "10:00"]), course("b", [3, "09:00", "10:00"])));
    expect(report.status).toBe("incomplete");
    expect(report.invalid).toEqual([{ meeting_id: "m-a-1", plan_course_id: "pc-a", course_id: "c-a", reason: "no_dates_in_term", dates: [] }]);
  });

  it("does not let an invalid meeting hide a real overlap elsewhere", () => {
    const report = detectConflicts(
      plan(SPRING_2027, course("a", [2, "09:00", "10:00"], [2, "11:00", "10:00"]), course("b", [2, "09:30", "10:30"])),
    );
    expect(report.status).toBe("conflicts");
    expect(report.invalid).toHaveLength(1);
  });
});

describe("detectConflicts: Beirut daylight-saving changes", () => {
  it("autumn 2026: Saturday 24 Oct 23:00-00:00 happened twice; a time in it means the first", () => {
    // Intl confirms the repeat: two instants an hour apart both read 23:15.
    const repeated = instantsOf("Asia/Beirut", "2026-10-24", "23:15");
    expect(repeated).toHaveLength(2);
    expect(repeated[1] - repeated[0]).toBe(3_600_000);
    expect(instantsOf("Asia/Beirut", "2026-10-17", "23:15")).toHaveLength(1);

    // On that one Saturday, 23:00-24:00 runs from the first 23:00, so it
    // covers both passes through the hour and meets a meeting in UTC that
    // falls in the first pass.
    const firstPassStartUtc = wallTime("UTC", repeated[0]);
    const firstPassEndUtc = wallTime("UTC", repeated[0] + 15 * 60_000);
    const report = detectConflicts(
      plan(
        { starts_on: "2026-10-24", ends_on: "2026-10-24" },
        course("beirut", [6, "23:00", "24:00"]),
        course("utc", [6, firstPassStartUtc, firstPassEndUtc, "UTC"]),
      ),
    );
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].dates).toEqual(["2026-10-24"]);
    expect([report.conflicts[0].start_minute, report.conflicts[0].end_minute]).toEqual([minutes("23:15"), minutes("23:30")]);
  });

  it("autumn 2026: Beirut meetings on the repeated night still compare like any other week", () => {
    const report = detectConflicts(plan(FALL_2026, course("a", [6, "23:00", "24:00"]), course("b", [6, "23:30", "24:00"]), course("c", [6, "22:00", "23:00"])));
    const ab = report.conflicts.filter((conflict) => conflict.meetings[1].course_id === "c-b");
    expect(ab).toHaveLength(1);
    expect(ab[0].every_week).toBe(true);
    expect(ab[0].dates).toContain("2026-10-24");
    // 22:00-23:00 and 23:00-24:00 stay adjacent, even on 24 Oct.
    expect(report.conflicts.some((conflict) => conflict.meetings.some((side) => side.course_id === "c-c"))).toBe(false);
  });

  it("spring 2027: Sunday 28 Mar 00:00-01:00 doesn't exist; a start in it is reported, other weeks still count", () => {
    expect(instantsOf("Asia/Beirut", "2027-03-28", "00:30")).toHaveLength(0);
    expect(instantsOf("Asia/Beirut", "2027-03-21", "00:30")).toHaveLength(1);

    const report = detectConflicts(plan(SPRING_2027, course("a", [7, "00:30", "01:30"]), course("b", [7, "01:00", "02:00"])));
    expect(report.invalid).toEqual([
      { meeting_id: "m-a-1", plan_course_id: "pc-a", course_id: "c-a", reason: "starts_in_dst_gap", dates: ["2027-03-28"] },
    ]);
    expect(report.status).toBe("conflicts");
    expect(report.conflicts[0].dates).not.toContain("2027-03-28");
    expect(report.conflicts[0].dates).toHaveLength(datesOn(7, SPRING_2027.starts_on, SPRING_2027.ends_on).length - 1);
  });

  it("spring 2027: an end time in the skipped hour means the moment the clocks jump", () => {
    const report = detectConflicts(plan(SPRING_2027, course("a", [6, "23:00", "24:00"]), course("b", [6, "22:00", "23:00"])));
    expect(report.invalid).toEqual([]);
    expect(report.status).toBe("clear");
  });
});

describe("detectConflicts: Beirut and New York", () => {
  /** Mondays in the term when New York `nyTime` reads `beirutTime` in Beirut, by Intl alone. */
  function mondaysWhen(term: { starts_on: string; ends_on: string }, nyTime: string, beirutTime: string): string[] {
    return datesOn(1, term.starts_on, term.ends_on).filter((date) => {
      const [instant] = instantsOf("America/New_York", date, nyTime);
      return wallTime("Asia/Beirut", instant) === beirutTime;
    });
  }

  it("fall 2026: Mon 08:00-09:00 Beirut and Mon 02:00-03:00 New York overlap only on 26 Oct", () => {
    expect(mondaysWhen(FALL_2026, "02:00", "08:00")).toEqual(["2026-10-26"]);

    const report = detectConflicts(
      plan(FALL_2026, course("beirut", [1, "08:00", "09:00"]), course("ny", [1, "02:00", "03:00", "America/New_York"])),
    );
    expect(report.status).toBe("conflicts");
    expect(report.conflicts).toEqual([
      expect.objectContaining({ weekday: 1, start_minute: 480, end_minute: 540, every_week: false, dates: ["2026-10-26"] }),
    ]);
  });

  it("spring 2027: the same pair overlaps only in the two weeks New York changes first", () => {
    const expected = mondaysWhen(SPRING_2027, "02:00", "08:00");
    expect(expected).toEqual(["2027-03-15", "2027-03-22"]);

    const report = detectConflicts(
      plan(SPRING_2027, course("beirut", [1, "08:00", "09:00"]), course("ny", [1, "02:00", "03:00", "America/New_York"])),
    );
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].every_week).toBe(false);
    expect(report.conflicts[0].dates).toEqual(expected);
  });

  it("fall 2026: a pair that overlaps most weeks reports the windows separately as the offsets change", () => {
    // Beirut 08:00-10:00 and New York 02:00-03:30: the overlap moves when either zone changes.
    const report = detectConflicts(
      plan(FALL_2026, course("beirut", [1, "08:00", "10:00"]), course("ny", [1, "02:00", "03:30", "America/New_York"])),
    );
    expect(report.conflicts.length).toBeGreaterThan(1);
    expect(report.conflicts.every((conflict) => !conflict.every_week)).toBe(true);
    const allDates = report.conflicts.flatMap((conflict) => conflict.dates).sort();
    expect(allDates).toEqual(datesOn(1, FALL_2026.starts_on, FALL_2026.ends_on));
  });
});
