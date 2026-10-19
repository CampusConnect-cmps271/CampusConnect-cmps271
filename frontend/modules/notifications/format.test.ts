import { describe, expect, it } from "vitest";
import {
  badgeText,
  bellLabel,
  formatNotificationTime,
  notificationHref,
  notificationSentence,
  TITLE_LENGTH,
} from "./format";

const base = {
  id: "00000000-0000-4000-8000-0000000000f1",
  actorName: "Ali Hassan",
  postTitle: "Study group tonight",
  conversationId: "00000000-0000-4000-8000-0000000000c1",
  postId: "00000000-0000-4000-8000-0000000000a1",
};

describe("notificationSentence", () => {
  it("builds the sentence for each type", () => {
    expect(notificationSentence({ ...base, type: "message" })).toBe("Ali Hassan sent you a message");
    expect(notificationSentence({ ...base, type: "post_comment" })).toBe(
      'Ali Hassan commented on your post "Study group tonight"',
    );
    expect(notificationSentence({ ...base, type: "comment_reply" })).toBe(
      "Ali Hassan replied to your comment",
    );
    expect(notificationSentence({ ...base, type: "content_removed", actorName: null })).toBe(
      'Your post "Study group tonight" was removed by a moderator',
    );
  });

  it("falls back when the name or title cannot be read", () => {
    expect(notificationSentence({ ...base, type: "message", actorName: null })).toBe(
      "A student sent you a message",
    );
    expect(notificationSentence({ ...base, type: "post_comment", postTitle: null })).toBe(
      "Ali Hassan commented on your post",
    );
    expect(notificationSentence({ ...base, type: "content_removed", postTitle: null })).toBe(
      "Your post was removed by a moderator",
    );
  });

  it("speaks of a removed comment when there is no post", () => {
    expect(notificationSentence({ ...base, type: "content_removed", postId: null })).toBe(
      "Your comment was removed by a moderator",
    );
  });

  it("shortens a long title onto one line", () => {
    const sentence = notificationSentence({
      ...base,
      type: "post_comment",
      postTitle: `Line one\n${"word ".repeat(30)}`,
    });
    const quoted = sentence.slice(sentence.indexOf('"') + 1, -1);

    expect(quoted).not.toContain("\n");
    expect(quoted.length).toBeLessThanOrEqual(TITLE_LENGTH);
    expect(quoted.endsWith("…")).toBe(true);
  });
});

describe("badgeText and bellLabel", () => {
  it.each([
    [0, "", "Notifications"],
    [1, "1", "Notifications, 1 unread"],
    [9, "9", "Notifications, 9 unread"],
    [10, "9+", "Notifications, 10 unread"],
    [250, "9+", "Notifications, 250 unread"],
  ])("%i unread shows %j", (count, badge, label) => {
    expect(badgeText(count)).toBe(badge);
    expect(bellLabel(count)).toBe(label);
  });

  it("shows nothing for a count it cannot use", () => {
    expect(badgeText(-1)).toBe("");
    expect(badgeText(Number.NaN)).toBe("");
    expect(bellLabel(Number.NaN)).toBe("Notifications");
  });
});

describe("notificationHref", () => {
  it("opens the conversation for a message", () => {
    expect(notificationHref({ ...base, type: "message" })).toBe(`/messages/${base.conversationId}`);
  });

  it("opens the post's comments for a comment or a reply", () => {
    for (const type of ["post_comment", "comment_reply"] as const) {
      expect(notificationHref({ ...base, type })).toBe(`/posts/${base.postId}#comments-heading`);
    }
  });

  it("opens a notice for removed content, since the post is gone", () => {
    expect(notificationHref({ ...base, type: "content_removed" })).toBe(
      `/notifications?removed=${base.id}`,
    );
  });
});

describe("formatNotificationTime", () => {
  it("shows the date and time in the campus time zone", () => {
    expect(formatNotificationTime("2026-10-18T11:05:00Z")).toBe("Oct 18, 2:05 PM");
  });
});
