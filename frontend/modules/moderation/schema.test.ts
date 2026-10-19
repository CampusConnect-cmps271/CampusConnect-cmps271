import { describe, expect, it } from "vitest";
import {
  liftSuspensionSchema,
  moderationDecisionSchema,
  reportSchema,
  suspensionSchema,
} from "./schema";

const id = "00000000-0000-4000-8000-000000000001";

describe("moderation input schemas", () => {
  it("accepts every report reason", () => {
    for (const reason of ["spam", "harassment", "offensive", "misleading", "other"]) {
      expect(
        reportSchema.safeParse({ targetType: "post", targetId: id, reason, details: "" })
          .success,
      ).toBe(true);
    }
  });

  it("rejects an invalid target and excessive details", () => {
    expect(
      reportSchema.safeParse({
        targetType: "profile",
        targetId: "bad",
        reason: "spam",
        details: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });

  it("requires a meaningful moderation reason", () => {
    expect(
      moderationDecisionSchema.safeParse({
        targetType: "comment",
        targetId: id,
        decision: "remove",
        reason: "no",
      }).success,
    ).toBe(false);
  });

  it("accepts temporary and indefinite suspensions", () => {
    expect(
      suspensionSchema.safeParse({
        userId: id,
        reason: "Repeated abuse",
        duration: "indefinite",
      }).success,
    ).toBe(true);
    expect(
      suspensionSchema.safeParse({
        userId: id,
        reason: "Repeated abuse",
        duration: "7d",
      }).success,
    ).toBe(true);
    expect(
      suspensionSchema.safeParse({
        userId: id,
        reason: "Repeated abuse",
        duration: "30d",
      }).success,
    ).toBe(false);
  });

  it("validates lift reasons", () => {
    expect(liftSuspensionSchema.safeParse({ userId: id, reason: "Appeal approved" }).success).toBe(true);
    expect(liftSuspensionSchema.safeParse({ userId: id, reason: "" }).success).toBe(false);
  });
});
