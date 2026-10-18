import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(),
  maybeSingle: vi.fn(), in: vi.fn(), logError: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/modules/logging", () => ({ log: { error: mocks.logError } }));

import { CourseUnavailable, getCourseDetail } from "./detail";
import { courseUrl, normalizeCourseCode, parsePrerequisiteReferences } from "./references";

const course = {
  id: "10000000-0000-4000-8000-000000000001", code: "CMPS 240", name: "Operating Systems",
  description: "First paragraph.\n\nThe complete final paragraph.", credits: 3,
  department: "Computer Science", prerequisites: "Prerequisite: CMPS 101 or CMPS 102; consent of instructor.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq, in: mocks.in });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: course, error: null });
  mocks.in.mockResolvedValue({ data: [{ code: "CMPS 101", name: "Computing" }], error: null });
});

describe("course references", () => {
  it("normalizes route codes without losing suffixes or leading zeros", () => {
    for (const [input, code] of [["cmps240", "CMPS 240"], ["BIOC-303b", "BIOC 303B"], [" GRDS 033 ", "GRDS 033"], ["TEST-399ABC", "TEST 399ABC"]]) {
      expect(normalizeCourseCode(input)).toBe(code);
    }
    for (const input of ["", "CMPS", "CMPS 240<script>", "CMPS 240 or 241", "CMPS 2400", "CMPS 24", "https://example.test"]) {
      expect(normalizeCourseCode(input)).toBeNull();
    }
  });

  it("preserves the complete prerequisite statement and boolean relationships", () => {
    const text = "Prerequisites: a C+ in either cmps202 or EECE 330, and CHEM 101L.\nConsent of instructor.";
    const parts = parsePrerequisiteReferences(text);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.flatMap((part) => part.code ?? [])).toEqual(["CMPS 202", "EECE 330", "CHEM 101L"]);
  });

  it("recognizes a shared subject only within an immediately connected list", () => {
    const text = "MATH 201, 202 or 203; and CHEM 101L/102L. A minimum grade of 80 is required. CMPS 240 or 2026 regulations.";
    const parts = parsePrerequisiteReferences(text);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.flatMap((part) => part.code ?? [])).toEqual(["MATH 201", "MATH 202", "MATH 203", "CHEM 101L", "CHEM 102L", "CMPS 240"]);
  });

  it("does not invent prerequisites from prose or absent requirements", () => {
    for (const text of ["", "Consent of instructor.", "Graduate standing; GPA 3.2 or above."]) {
      const parts = parsePrerequisiteReferences(text);
      expect(parts.map((part) => part.text).join("")).toBe(text);
      expect(parts.some((part) => part.code)).toBe(false);
    }
  });

  it("builds safe detail links that retain catalogue filters", () => {
    const filters = { query: "CMPS & x=1", department: "Arts & Sciences", page: 2 };
    const url = new URL(courseUrl("BIOC 303B", filters), "https://example.test");
    expect(url.pathname).toBe("/courses/BIOC-303B");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: filters.query, department: filters.department, page: "2" });
    expect(courseUrl("GRDS 033")).toBe("/courses/GRDS-033");
  });
});

describe("course detail queries", () => {
  it("requires authentication even for a malformed code", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("redirect to login"));
    await expect(getCourseDetail("invalid")).rejects.toThrow("redirect to login");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns null for malformed codes without querying the database", async () => {
    expect(await getCourseDetail('CMPS 240,code.neq.secret')).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reads one exact code and resolves only known prerequisite courses", async () => {
    const detail = await getCourseDetail("cmps-240");
    expect(mocks.eq).toHaveBeenCalledWith("code", "CMPS 240");
    expect(mocks.select).toHaveBeenCalledWith("id,code,name,credits,description,department,prerequisites");
    expect(mocks.in).toHaveBeenCalledWith("code", ["CMPS 101", "CMPS 102"]);
    expect(detail?.course).toEqual(course);
    expect([...detail!.references.keys()]).toEqual(["CMPS 101"]);
    expect(detail?.hasUnresolvedReferences).toBe(true);
    expect(detail?.linksUnavailable).toBe(false);
  });

  it("returns null for a missing course rather than showing a database error", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getCourseDetail("CMPS-999")).toBeNull();
    expect(mocks.in).not.toHaveBeenCalled();
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("avoids a prerequisite lookup for a course with no listed prerequisites", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...course, prerequisites: "" }, error: null });
    expect(await getCourseDetail("CMPS-240")).toMatchObject({ prerequisiteParts: [], linksUnavailable: false, hasUnresolvedReferences: false });
    expect(mocks.in).not.toHaveBeenCalled();
  });

  it("deduplicates references and bounds lookup request sizes", async () => {
    const codes = Array.from({ length: 101 }, (_, index) => `CMPS ${100 + index}`);
    mocks.maybeSingle.mockResolvedValue({ data: { ...course, prerequisites: [...codes, codes[0]].join(" or ") }, error: null });
    await getCourseDetail("CMPS-240");
    expect(mocks.in.mock.calls.map((call) => call[1].length)).toEqual([100, 1]);
  });

  it("distinguishes a database failure from a missing course without leaking details", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "57014", message: "private database details" } });
    await expect(getCourseDetail("CMPS-240")).rejects.toThrow(CourseUnavailable);
    expect(mocks.logError).toHaveBeenCalledWith("courses.detail.read_failure", { code: "57014" });
  });

  it("keeps the course readable when prerequisite links cannot load", async () => {
    mocks.in.mockResolvedValue({ data: null, error: { code: "57014", message: "private lookup details" } });
    const detail = await getCourseDetail("CMPS-240");
    expect(detail?.course).toEqual(course);
    expect(detail?.linksUnavailable).toBe(true);
    expect(detail?.references.size).toBe(0);
    expect(detail?.prerequisiteParts.map((part) => part.text).join("")).toBe(course.prerequisites);
  });

  it("handles a thrown prerequisite connection failure without hiding the course", async () => {
    mocks.in.mockRejectedValueOnce(new Error("private connection details"));
    expect(await getCourseDetail("CMPS-240")).toMatchObject({ course, linksUnavailable: true });
    expect(mocks.logError).toHaveBeenCalledWith("courses.prerequisites.read_failure", { code: "connection_failure" });
  });

  it("converts a thrown course connection failure to the safe retry state", async () => {
    mocks.maybeSingle.mockRejectedValueOnce(new Error("private connection details"));
    await expect(getCourseDetail("CMPS-240")).rejects.toThrow("The course information is temporarily unavailable.");
    expect(mocks.logError).toHaveBeenCalledWith("courses.detail.read_failure", { code: "connection_failure" });
  });
});
