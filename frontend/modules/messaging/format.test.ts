import { describe, expect, it } from "vitest";
import {
  formatMessageTime,
  formatRelativeTime,
  messagePreview,
  PREVIEW_LENGTH,
} from "./format";

describe("messagePreview", () => {
  it("keeps a short message as it is", () => {
    expect(messagePreview("See you at 5")).toBe("See you at 5");
  });

  it("collapses line breaks and repeated spaces into one line", () => {
    expect(messagePreview("  Line one\n\n  line   two\t")).toBe("Line one line two");
  });

  it("keeps a message of exactly the limit whole", () => {
    const text = "a".repeat(PREVIEW_LENGTH);
    expect(messagePreview(text)).toBe(text);
  });

  it("cuts a long message at a word boundary and adds an ellipsis", () => {
    const text = "word ".repeat(30);
    const preview = messagePreview(text);

    expect(preview.length).toBeLessThanOrEqual(PREVIEW_LENGTH);
    expect(preview.endsWith("word…")).toBe(true);
  });

  it("hard-cuts one long word that fills the preview", () => {
    const preview = messagePreview("x".repeat(150));

    expect(preview).toBe(`${"x".repeat(PREVIEW_LENGTH - 1)}…`);
  });

  it("marks a preview the database already cut at 100 characters", () => {
    expect(messagePreview("y".repeat(100)).endsWith("…")).toBe(true);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-18T12:00:00Z"); // 3 PM in Beirut

  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

  it.each([
    [0, "just now"],
    [59, "just now"],
    [60, "1 minute ago"],
    [45 * 60, "45 minutes ago"],
    [60 * 60, "1 hour ago"],
    [23 * 60 * 60, "23 hours ago"],
  ])("%i seconds ago reads %j", (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), now)).toBe(expected);
  });

  it("counts days by the campus calendar", () => {
    expect(formatRelativeTime("2026-10-17T08:00:00Z", now)).toBe("yesterday");
    expect(formatRelativeTime("2026-10-15T12:00:00Z", now)).toBe("3 days ago");
    expect(formatRelativeTime("2026-10-12T12:00:00Z", now)).toBe("6 days ago");
  });

  it("switches to a date after a week, with the year only when it differs", () => {
    expect(formatRelativeTime("2026-10-11T09:00:00Z", now)).toBe("Oct 11");
    expect(formatRelativeTime("2025-12-30T09:00:00Z", now)).toBe("Dec 30, 2025");
  });

  it("treats a time slightly in the future as just now", () => {
    expect(formatRelativeTime("2026-10-18T12:00:05Z", now)).toBe("just now");
  });
});

describe("formatMessageTime", () => {
  it("shows the date and time in the campus time zone", () => {
    expect(formatMessageTime("2026-10-18T11:05:00Z")).toBe("Oct 18, 2:05 PM");
  });
});
