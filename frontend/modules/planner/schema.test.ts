import { describe, expect, it } from "vitest";
import { EMPTY_MEETING_FORM, planSchema, readMeetingForm, validateItemForm, validateMeetingForm } from "./schema";
import { TERM_PATTERN } from "./terms";
import { minutesFromTime, timeFromMinutes } from "./time";

const meeting = (fields: Partial<typeof EMPTY_MEETING_FORM>) => ({ ...EMPTY_MEETING_FORM, ...fields });

describe("term pattern", () => {
  it("accepts a season and a year from 2025 to 2035", () => {
    for (const term of ["Fall 2025", "Spring 2027", "Summer 2035"]) expect(TERM_PATTERN.test(term)).toBe(true);
  });

  it("rejects other seasons, years and spellings", () => {
    for (const term of ["Winter 2027", "Spring 2024", "Spring 2036", "spring 2027", "Spring  2027", "Spring 2027 ", "Fall 26"]) {
      expect(TERM_PATTERN.test(term)).toBe(false);
    }
  });
});

describe("planSchema", () => {
  it("accepts an official term", () => {
    expect(planSchema.safeParse({ term: " Spring 2027 " }).data).toEqual({ term: "Spring 2027" });
  });

  it("rejects a well-formed term without official dates, and an empty choice", () => {
    expect(planSchema.safeParse({ term: "Fall 2034" }).success).toBe(false);
    expect(planSchema.safeParse({ term: "" }).success).toBe(false);
    expect(planSchema.safeParse({}).success).toBe(false);
  });
});

describe("HH:MM helpers", () => {
  it("turns HH:MM into minutes after midnight", () => {
    expect(minutesFromTime("00:00")).toBe(0);
    expect(minutesFromTime("09:30")).toBe(570);
    expect(minutesFromTime("23:59")).toBe(1439);
  });

  it("rejects anything that isn't a 24-hour HH:MM time", () => {
    for (const value of ["24:00", "9:30", "09:60", "09:30:00", "9.30", "", "ab:cd", " 09:30"]) {
      expect(minutesFromTime(value)).toBeNull();
    }
  });

  it("turns minutes back into HH:MM, with 1440 as 24:00", () => {
    expect(timeFromMinutes(0)).toBe("00:00");
    expect(timeFromMinutes(645)).toBe("10:45");
    expect(timeFromMinutes(1440)).toBe("24:00");
  });
});

describe("validateMeetingForm", () => {
  it("returns the meeting in minutes, in Asia/Beirut", () => {
    expect(validateMeetingForm(meeting({ weekday: "2", start: "09:30", end: "10:45" }))).toEqual({
      success: true,
      data: { weekday: 2, start: 570, end: 645, timezone: "Asia/Beirut" },
    });
  });

  it("needs the end after the start, on the same day", () => {
    const equal = validateMeetingForm(meeting({ start: "10:00", end: "10:00" }));
    const before = validateMeetingForm(meeting({ start: "14:00", end: "13:00" }));
    expect(equal).toEqual({ success: false, errors: { end: "The end time must be after the start time." } });
    expect(before).toEqual({ success: false, errors: { end: "The end time must be after the start time." } });
  });

  it("explains missing and malformed times", () => {
    expect(validateMeetingForm(meeting({ start: "", end: "" }))).toEqual({
      success: false,
      errors: { start: "Enter a start time.", end: "Enter an end time." },
    });
    expect(validateMeetingForm(meeting({ start: "9am", end: "10:00" }))).toEqual({
      success: false,
      errors: { start: "Enter the start time as HH:MM." },
    });
  });

  it("accepts ISO weekdays 1 to 7 only", () => {
    expect(validateMeetingForm(meeting({ weekday: "7", start: "08:00", end: "09:00" })).success).toBe(true);
    for (const weekday of ["0", "8", "", "Mon", "1.5"]) {
      const result = validateMeetingForm(meeting({ weekday, start: "08:00", end: "09:00" }));
      expect(result).toEqual({ success: false, errors: { weekday: "Choose a day." } });
    }
  });

  it("accepts any IANA zone, saved under Intl's name for it", () => {
    for (const [typed, saved] of [
      ["America/New_York", "America/New_York"],
      ["Europe/London", "Europe/London"],
      ["asia/beirut", "Asia/Beirut"],
      [" UTC ", "UTC"],
    ]) {
      const result = validateMeetingForm(meeting({ timezone: typed, start: "08:00", end: "09:00" }));
      expect(result.success && result.data.timezone).toBe(saved);
    }
  });

  it("rejects names that aren't IANA time zones", () => {
    for (const timezone of ["Beirut", "Mars/Olympus_Mons", "GMT+3 ", "../etc"]) {
      const result = validateMeetingForm(meeting({ timezone, start: "08:00", end: "09:00" }));
      expect(result).toEqual({
        success: false,
        errors: { timezone: "Enter an IANA time zone, such as Asia/Beirut or America/New_York." },
      });
    }
    expect(validateMeetingForm(meeting({ timezone: "", start: "08:00", end: "09:00" }))).toEqual({
      success: false,
      errors: { timezone: "Enter a time zone, such as Asia/Beirut." },
    });
  });

  it("reads missing form fields as empty", () => {
    const formData = new FormData();
    formData.set("start", "08:00");
    expect(readMeetingForm(formData)).toEqual({ weekday: "", start: "08:00", end: "", timezone: "" });
  });
});

describe("validateItemForm", () => {
  const window = { first: "2026-12-14", last: "2027-05-27" };
  const valid = { title: "CMPS 202 midterm", date: "2027-03-02", start: "10:00", end: "11:00", planCourseId: "" };

  it("accepts a timed item and an all-day item, trimming the title", () => {
    expect(validateItemForm({ ...valid, title: "  CMPS 202 midterm " }, window)).toEqual({
      success: true,
      data: { title: "CMPS 202 midterm", date: "2027-03-02", start: 600, end: 660, planCourseId: null },
    });
    const allDay = validateItemForm({ ...valid, start: "", end: "" }, window);
    expect(allDay.success && allDay.data).toMatchObject({ start: null, end: null });
  });

  it("keeps a linked course's id", () => {
    const id = "72000000-0000-4000-8000-000000000101";
    const result = validateItemForm({ ...valid, planCourseId: id }, window);
    expect(result.success && result.data.planCourseId).toBe(id);
    expect(validateItemForm({ ...valid, planCourseId: "not-an-id" }, window)).toMatchObject({
      success: false,
      errors: { planCourseId: "Choose a course from the list." },
    });
  });

  it("explains each problem on its own field", () => {
    expect(validateItemForm({ ...valid, title: "   " }, window)).toMatchObject({ errors: { title: "Enter a title, such as CMPS 202 midterm." } });
    expect(validateItemForm({ ...valid, title: "x".repeat(121) }, window)).toMatchObject({ errors: { title: "Keep the title to 120 characters." } });
    expect(validateItemForm({ ...valid, date: "" }, window)).toMatchObject({ errors: { date: "Choose a date." } });
    expect(validateItemForm({ ...valid, date: "2027-02-30" }, window)).toMatchObject({ errors: { date: "Enter the date as YYYY-MM-DD." } });
    expect(validateItemForm({ ...valid, date: "2027-05-28" }, window)).toMatchObject({
      errors: { date: "Pick a date between Mon, 14 Dec 2026 and Thu, 27 May 2027." },
    });
    expect(validateItemForm({ ...valid, end: "" }, window)).toMatchObject({ errors: { end: "Enter both times, or neither for an all-day item." } });
    expect(validateItemForm({ ...valid, start: "" }, window)).toMatchObject({ errors: { start: "Enter both times, or neither for an all-day item." } });
    expect(validateItemForm({ ...valid, end: "09:00" }, window)).toMatchObject({ errors: { end: "The end time must be after the start time." } });
    expect(validateItemForm({ ...valid, start: "25:00" }, window)).toMatchObject({ errors: { start: "Enter the start time as HH:MM." } });
  });
});
