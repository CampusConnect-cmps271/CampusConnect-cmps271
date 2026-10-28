import { describe, expect, it } from "vitest";
import { announcementSchema, verificationReviewSchema } from "./schema";

describe("club inputs", () => {
  const announcement = { clubId: "00000000-0000-4000-8000-000000000001", slug: "robotics-club", title: "Workshop", body: "Join our workshop next week.", intent: "publish" };
  it("accepts a complete announcement and rejects short or unsafe fields", () => {
    expect(announcementSchema.safeParse(announcement).success).toBe(true);
    expect(announcementSchema.safeParse({ ...announcement, title: "x" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...announcement, slug: "../admin" }).success).toBe(false);
  });

  it("requires an explanation only for rejections", () => {
    const base = { clubId: announcement.clubId, slug: announcement.slug, reason: "" };
    expect(verificationReviewSchema.safeParse({ ...base, decision: "verified" }).success).toBe(true);
    expect(verificationReviewSchema.safeParse({ ...base, decision: "rejected" }).success).toBe(false);
    expect(verificationReviewSchema.safeParse({ ...base, decision: "rejected", reason: "Missing official contact" }).success).toBe(true);
  });
});
