import { describe, expect, it } from "vitest";
import { creditHundredths, creditLabel, formatCredits, totalCreditHundredths } from "./credits";
import { FIXTURE_COURSES, FIXTURE_CREDIT_HUNDREDTHS } from "./fixtures";

const courses = (...credits: (number | string)[]) => credits.map((value) => ({ credits: value }));

describe("credit totals", () => {
  it("adds whole credits: 3 + 3 + 1 = 7", () => {
    const total = totalCreditHundredths(courses(3, 3, 1));
    expect(total).toBe(700);
    expect(creditLabel(total)).toBe("7 credits");
  });

  it("adds decimals exactly: 1.10 + 2.20 = 3.30, unlike floating point", () => {
    expect(1.1 + 2.2).not.toBe(3.3);
    const total = totalCreditHundredths(courses(1.1, "2.20"));
    expect(total).toBe(330);
    expect(formatCredits(total)).toBe("3.3");
  });

  it("counts a zero-credit lab as nothing", () => {
    expect(totalCreditHundredths(courses(3, 0, "0.00"))).toBe(300);
  });

  it("totals an empty plan as zero", () => {
    expect(totalCreditHundredths([])).toBe(0);
    expect(creditLabel(0)).toBe("0 credits");
  });

  it("reads numeric(5,2) values however PostgREST sends them", () => {
    expect(creditHundredths(3.25)).toBe(325);
    expect(creditHundredths("3.25")).toBe(325);
    expect(creditHundredths("3.00")).toBe(300);
    expect(creditHundredths(999.99)).toBe(99999);
    expect(creditHundredths(0.05)).toBe(5);
  });

  it("rejects values the catalogue can't hold", () => {
    expect(() => creditHundredths("3.255")).toThrow(RangeError);
    expect(() => creditHundredths(-1)).toThrow(RangeError);
    expect(() => creditHundredths("three")).toThrow(RangeError);
  });

  it("formats totals the way the course pages show credits", () => {
    expect(formatCredits(625)).toBe("6.25");
    expect(formatCredits(1205)).toBe("12.05");
    expect(creditLabel(100)).toBe("1 credit");
  });

  it("matches the fixture plan's total", () => {
    expect(totalCreditHundredths(FIXTURE_COURSES)).toBe(FIXTURE_CREDIT_HUNDREDTHS);
  });
});
