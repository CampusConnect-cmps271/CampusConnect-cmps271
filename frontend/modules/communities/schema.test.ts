import { describe, expect, it } from "vitest";
import {
  COMMUNITY_POST_CATEGORIES,
  EMPTY_COMMUNITY_FORM,
  readCommunityForm,
  tidyName,
  validateCommunityForm,
  validateCommunityPostForm,
} from "./schema";

const courseId = "10000000-0000-4000-8000-000000000001";
const form = (values: Partial<typeof EMPTY_COMMUNITY_FORM>) => ({ ...EMPTY_COMMUNITY_FORM, ...values });

describe("community form", () => {
  it("tidies the name and leaves an empty description out", () => {
    const result = validateCommunityForm(form({ name: "  Chess   & Coffee ", description: "   ", topic: "interest" }));
    expect(result).toEqual({
      success: true,
      data: { name: "Chess & Coffee", description: null, topic: "interest", courseId: null },
    });
  });

  it("needs a course for a course community, and drops one for any other topic", () => {
    expect(validateCommunityForm(form({ name: "CMPS 271 study group", topic: "course" }))).toEqual({
      success: false,
      errors: { courseId: "Choose the course." },
    });
    expect(validateCommunityForm(form({ name: "CMPS 271 study group", topic: "course", courseId }))).toMatchObject({
      success: true,
      data: { topic: "course", courseId },
    });
    expect(validateCommunityForm(form({ name: "Board games", topic: "interest", courseId }))).toMatchObject({
      success: true,
      data: { courseId: null },
    });
  });

  it("checks the name's length after tidying, and the description's", () => {
    expect(validateCommunityForm(form({ name: "  a    ", topic: "other" }))).toMatchObject({
      success: false,
      errors: { name: "Use at least 3 characters." },
    });
    expect(validateCommunityForm(form({ name: "x".repeat(81), topic: "other" }))).toMatchObject({
      success: false,
      errors: { name: "Use at most 80 characters." },
    });
    expect(validateCommunityForm(form({ name: "Long", topic: "other", description: "y".repeat(501) }))).toMatchObject({
      success: false,
      errors: { description: "Use at most 500 characters." },
    });
  });

  it("refuses an unknown topic", () => {
    expect(validateCommunityForm(form({ name: "Sports fans", topic: "sports" }))).toEqual({
      success: false,
      errors: { topic: "Choose a topic." },
    });
  });

  it("accepts Arabic names", () => {
    expect(validateCommunityForm(form({ name: "نادي القراءة", topic: "interest" }))).toMatchObject({ success: true });
  });

  it("reads the form's fields as text", () => {
    const data = new FormData();
    data.set("name", "Housing near Bliss");
    data.set("topic", "housing");
    expect(readCommunityForm(data)).toEqual({ ...EMPTY_COMMUNITY_FORM, name: "Housing near Bliss", topic: "housing" });
  });

  it("collapses whitespace in names", () => {
    expect(tidyName(" CMPS\t271 \n study ")).toBe("CMPS 271 study");
  });
});

describe("community post form", () => {
  it("uses the feed's categories, without SkillSwap", () => {
    expect(COMMUNITY_POST_CATEGORIES).toEqual(["Academics", "Campus Life", "Housing", "Clubs & Events", "General"]);
    expect(validateCommunityPostForm({ title: "Swap", body: "Body", category: "SkillSwap" })).toMatchObject({
      success: false,
      errors: { category: "Please select a valid category." },
    });
  });

  it("follows the post rules for title and body", () => {
    expect(validateCommunityPostForm({ title: " ", body: "", category: "General" })).toEqual({
      success: false,
      errors: { title: "Please enter a title.", body: "Please enter post content." },
    });
    expect(validateCommunityPostForm({ title: " Review ", body: " Chapter 3 ", category: "Academics" })).toEqual({
      success: true,
      data: { title: "Review", body: "Chapter 3", category: "Academics" },
    });
  });
});
