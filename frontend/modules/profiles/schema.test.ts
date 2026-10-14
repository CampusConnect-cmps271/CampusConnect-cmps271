import { describe, expect, it } from "vitest";
import {
  parseInterests,
  profileFormValues,
  readProfileForm,
  validateProfileForm,
  type ProfileFormValues,
} from "./schema";

function form(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
  return {
    fullName: "Test Student",
    major: "",
    graduationYear: "",
    bio: "",
    interests: "",
    ...overrides,
  };
}

function errorsFor(values: ProfileFormValues) {
  const result = validateProfileForm(values);
  if (result.success) throw new Error("expected the form to be rejected");
  return result.errors;
}

describe("profile form schema", () => {
  it("normalises a complete profile", () => {
    expect(
      validateProfileForm(
        form({
          fullName: "  Test    Student ",
          major: " Computer Science ",
          graduationYear: " 2027 ",
          bio: "  Line one\nLine two  ",
          interests: "Chess, python ,, Python, Machine   learning",
        }),
      ),
    ).toEqual({
      success: true,
      data: {
        fullName: "Test Student",
        major: "Computer Science",
        graduationYear: 2027,
        bio: "Line one\nLine two",
        interests: ["Chess", "python", "Machine learning"],
      },
    });
  });

  it("stores blank optional fields as empty", () => {
    expect(validateProfileForm(form({ major: "   ", bio: " ", interests: " , " }))).toEqual({
      success: true,
      data: {
        fullName: "Test Student",
        major: null,
        graduationYear: null,
        bio: null,
        interests: [],
      },
    });
  });

  it("requires a name of at most 100 characters", () => {
    expect(errorsFor(form({ fullName: "   " })).fullName).toEqual(["Full name is required"]);
    expect(errorsFor(form({ fullName: "x".repeat(101) })).fullName).toEqual([
      "Full name must be 100 characters or fewer",
    ]);
    expect(validateProfileForm(form({ fullName: "x".repeat(100) })).success).toBe(true);
  });

  it("accepts graduation years from 2020 to 2035 only", () => {
    for (const year of ["2020", "2035"]) {
      expect(validateProfileForm(form({ graduationYear: year })).success).toBe(true);
    }

    for (const year of ["2019", "2036", "27", "20270", "two", "2027.5"]) {
      expect(errorsFor(form({ graduationYear: year })).graduationYear).toEqual([
        "Enter a year between 2020 and 2035",
      ]);
    }
  });

  it("limits major and bio length", () => {
    expect(errorsFor(form({ major: "x".repeat(101) })).major).toEqual([
      "Major must be 100 characters or fewer",
    ]);
    expect(errorsFor(form({ bio: "x".repeat(501) })).bio).toEqual([
      "Bio must be 500 characters or fewer",
    ]);
    expect(validateProfileForm(form({ bio: "x".repeat(500) })).success).toBe(true);
  });

  it("limits interests to 10 tags of 40 characters", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `tag${index}`).join(",");
    expect(errorsFor(form({ interests: eleven })).interests).toEqual(["Add up to 10 interests"]);
    expect(errorsFor(form({ interests: `ok, ${"x".repeat(41)}` })).interests).toEqual([
      "Each interest must be 40 characters or fewer",
    ]);
  });

  it("reports every invalid field at once", () => {
    expect(
      Object.keys(errorsFor(form({ fullName: "", graduationYear: "1999", bio: "x".repeat(600) }))).sort(),
    ).toEqual(["bio", "fullName", "graduationYear"]);
  });
});

describe("profile form helpers", () => {
  it("drops blank and duplicate interests, ignoring case", () => {
    expect(parseInterests(" AI ,ai, Web  Development,,")).toEqual(["AI", "Web Development"]);
  });

  it("reads missing or non-text fields as empty", () => {
    const data = new FormData();
    data.set("fullName", "Test Student");
    data.set("bio", new Blob(["file"]));

    expect(readProfileForm(data)).toEqual({
      fullName: "Test Student",
      major: "",
      graduationYear: "",
      bio: "",
      interests: "",
    });
  });

  it("turns a saved profile back into the form's text", () => {
    expect(
      profileFormValues({
        fullName: "Test Student",
        major: null,
        graduationYear: 2027,
        bio: null,
        interests: ["Chess", "Python"],
      }),
    ).toEqual({
      fullName: "Test Student",
      major: "",
      graduationYear: "2027",
      bio: "",
      interests: "Chess, Python",
    });
  });
});
