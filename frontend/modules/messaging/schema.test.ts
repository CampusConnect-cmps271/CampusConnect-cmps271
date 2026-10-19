import { describe, expect, it } from "vitest";
import {
  earlierCursorSchema,
  MESSAGE_MAX_LENGTH,
  messageBodySchema,
  messageTimeSchema,
} from "./schema";

describe("messageBodySchema", () => {
  it("trims the message before it is saved", () => {
    expect(messageBodySchema.parse("  Hello there \n")).toBe("Hello there");
  });

  it("keeps line breaks inside the message", () => {
    expect(messageBodySchema.parse("Line one\n\nLine two")).toBe("Line one\n\nLine two");
  });

  it.each(["", "   ", "\n\t \n"])("rejects a blank message (%j)", (body) => {
    const result = messageBodySchema.safeParse(body);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Write a message first.");
  });

  it("accepts exactly 2000 characters after trimming", () => {
    const body = `  ${"x".repeat(MESSAGE_MAX_LENGTH)}  `;
    expect(messageBodySchema.parse(body)).toHaveLength(MESSAGE_MAX_LENGTH);
  });

  it("rejects 2001 characters", () => {
    const result = messageBodySchema.safeParse("x".repeat(MESSAGE_MAX_LENGTH + 1));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Messages can be up to 2000 characters.");
  });

  it("rejects anything that is not text", () => {
    expect(messageBodySchema.safeParse(42).success).toBe(false);
    expect(messageBodySchema.safeParse(null).success).toBe(false);
  });
});

describe("message times and cursors", () => {
  it("accepts the timestamps Supabase returns", () => {
    expect(messageTimeSchema.safeParse("2026-10-18T09:15:02.123456+00:00").success).toBe(true);
    expect(messageTimeSchema.safeParse("2026-10-18T09:15:02Z").success).toBe(true);
  });

  it("rejects anything else", () => {
    for (const value of ["yesterday", "2026-10-18", "2026-10-18T09:15:02"]) {
      expect(messageTimeSchema.safeParse(value).success).toBe(false);
    }
  });

  it("needs both the time and the id of the oldest message", () => {
    expect(
      earlierCursorSchema.safeParse({
        createdAt: "2026-10-18T09:15:02.123456+00:00",
        id: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
    expect(earlierCursorSchema.safeParse({ createdAt: "2026-10-18T09:15:02Z" }).success).toBe(
      false,
    );
  });
});
