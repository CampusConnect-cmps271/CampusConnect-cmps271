
import * as z from "zod";
import { describe, expect, it } from "vitest";
import { postSchema } from "./schema";

const VALID_POST = {
  title: "Looking for a study group",
  body: "Anyone studying for the upcoming exam?",
  category: "Academics",
};

function fieldErrors(input: unknown) {
  const result = postSchema.safeParse(input);

  if (result.success) return null;

  return z.flattenError(result.error).fieldErrors;
}

describe("post creation schema", () => {
  it("accepts a valid post", () => {
    const result = postSchema.safeParse(VALID_POST);

    expect(result.success).toBe(true);
  });

  it("trims whitespace from title and body", () => {
    const result = postSchema.safeParse({
      ...VALID_POST,
      title: "  Study group  ",
      body: "  Looking for classmates  ",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.title).toBe("Study group");
      expect(result.data.body).toBe("Looking for classmates");
    }
  });

  it("rejects an empty title", () => {
    expect(
      fieldErrors({ ...VALID_POST, title: "" })?.title,
    ).toEqual(["Please enter a title."]);
  });

  it("rejects a whitespace-only title", () => {
    expect(
      fieldErrors({ ...VALID_POST, title: "   " })?.title,
    ).toEqual(["Please enter a title."]);
  });

  it("rejects an empty body", () => {
    expect(
      fieldErrors({ ...VALID_POST, body: "" })?.body,
    ).toEqual(["Please enter post content."]);
  });

  it("rejects a whitespace-only body", () => {
    expect(
      fieldErrors({ ...VALID_POST, body: "   " })?.body,
    ).toEqual(["Please enter post content."]);
  });

  it("accepts a title of exactly 200 characters", () => {
    expect(
      postSchema.safeParse({
        ...VALID_POST,
        title: "A".repeat(200),
      }).success,
    ).toBe(true);
  });

  it("rejects a title longer than 200 characters", () => {
    expect(
      fieldErrors({
        ...VALID_POST,
        title: "A".repeat(201),
      })?.title,
    ).toEqual(["Title cannot exceed 200 characters."]);
  });

  it("accepts a body of exactly 10000 characters", () => {
    expect(
      postSchema.safeParse({
        ...VALID_POST,
        body: "A".repeat(10000),
      }).success,
    ).toBe(true);
  });

  it("rejects a body longer than 10000 characters", () => {
    expect(
      fieldErrors({
        ...VALID_POST,
        body: "A".repeat(10001),
      })?.body,
    ).toEqual(["Content cannot exceed 10000 characters."]);
  });

  it("requires a category", () => {
    expect(
      postSchema.safeParse({
        ...VALID_POST,
        category: "",
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid category", () => {
    expect(
      postSchema.safeParse({
        ...VALID_POST,
        category: "Sports",
      }).success,
    ).toBe(false);
  });

  it("accepts all five supported categories", () => {
    const categories = [
      "Academics",
      "Campus Life",
      "Housing",
      "Clubs & Events",
      "General",
    ];

    for (const category of categories) {
      expect(
        postSchema.safeParse({
          ...VALID_POST,
          category,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects multiple invalid fields together", () => {
    const errors = fieldErrors({
      title: "",
      body: "",
      category: "",
    });

    expect(errors?.title).toBeDefined();
    expect(errors?.body).toBeDefined();
    expect(errors?.category).toBeDefined();
  });
});
