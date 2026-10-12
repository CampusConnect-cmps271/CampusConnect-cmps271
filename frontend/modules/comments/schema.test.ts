import { describe, expect, it } from "vitest";
import { commentSchema } from "./schema";

describe("commentSchema", () => {
  it("accepts a top-level comment", () => {
    const result = commentSchema.safeParse({
      body: "  Great post!  ",
      parentId: null,
    });

    expect(result.success).toBe(true);
    expect(result.data?.body).toBe("Great post!");
  });

  it("accepts a reply with a parent id", () => {
    const result = commentSchema.safeParse({
      body: "Agreed",
      parentId: "00000000-0000-4000-8000-000000000001",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty or whitespace-only comment", () => {
    const result = commentSchema.safeParse({
      body: "   ",
      parentId: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects comments over 2000 characters", () => {
    const result = commentSchema.safeParse({
      body: "a".repeat(2001),
      parentId: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a parent id that is not a uuid", () => {
    const result = commentSchema.safeParse({
      body: "Hi",
      parentId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });
});
