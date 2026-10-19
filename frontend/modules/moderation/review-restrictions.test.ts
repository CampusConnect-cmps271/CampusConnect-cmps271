import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { checkContentRestrictions } from "./restrictions";

const input = { userId: "verified-student", contentType: "review" as const, body: "Useful practical work." };

function database(data: { id: string; body: string }[] | null, error: { code: string } | null = null) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  };
  const from = vi.fn().mockReturnValue(query);
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { from, ...query };
}

beforeEach(() => vi.clearAllMocks());

it("looks up only the verified student's recent reviews", async () => {
  const query = database([]);
  const before = Date.now() - 60_000;
  expect(await checkContentRestrictions(input)).toEqual({ allowed: true });
  expect(query.from).toHaveBeenCalledWith("course_reviews");
  expect(query.select).toHaveBeenCalledWith("id, body");
  expect(query.eq).toHaveBeenCalledExactlyOnceWith("student_id", input.userId);
  const [field, since] = query.gte.mock.calls[0];
  expect(field).toBe("created_at");
  expect(Date.parse(since)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(since)).toBeLessThanOrEqual(Date.now() - 60_000);
  expect(query.limit).toHaveBeenCalledWith(15);
});

it("fails closed when the recent-review lookup fails", async () => {
  database(null, { code: "42501" });
  expect(await checkContentRestrictions(input)).toMatchObject({ allowed: false, rule: "check_unavailable" });
});

it("checks duplicates but excludes the review being edited", async () => {
  database([{ id: "current", body: "  USEFUL practical work. " }]);
  expect(await checkContentRestrictions(input)).toMatchObject({ allowed: false, rule: "duplicate_content" });
  expect(await checkContentRestrictions({ ...input, excludeId: "current" })).toEqual({ allowed: true });
});

it("limits new reviews without blocking edits at the creation limit", async () => {
  database(Array.from({ length: 5 }, (_, index) => ({ id: String(index), body: `Other review ${index}` })));
  expect(await checkContentRestrictions(input)).toMatchObject({ allowed: false, rule: "posting_too_quickly" });
  expect(await checkContentRestrictions({ ...input, excludeId: "0" })).toEqual({ allowed: true });
});
