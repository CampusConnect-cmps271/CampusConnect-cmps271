import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), requireUser: vi.fn(), createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth", () => ({ getCurrentUser: mocks.getCurrentUser, requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/profiles", () => ({ getDisplayNames: async () => ({}) }));
vi.mock("@/modules/logging", () => ({ log: { error: vi.fn() } }));
vi.mock("@/modules/logging/api-metrics", () => ({ trackApiRequest: (_endpoint: string, _method: string, handler: unknown) => handler }));
vi.mock("@/modules/notifications", async () => ({ getNotificationSummaryForUser: (await import("./queries")).getNotificationSummaryForUser }));

import { GET } from "@/app/api/notifications/route";
import { getMyNotificationSummary } from "./queries";

const user = { id: "student-a", name: "Student A", email: "a@example.test" };
let reads: { recipient: string; head: boolean }[];
let failList = false;

beforeEach(() => {
  vi.clearAllMocks();
  reads = []; failList = false;
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.requireUser.mockResolvedValue(user);
  mocks.createClient.mockImplementation(async () => ({
    from(table: string) {
      expect(table).toBe("notifications");
      let recipient = "", head = false;
      const query = {
        select: (_fields: string, options?: { head?: boolean }) => { head = !!options?.head; return query; },
        eq: (column: string, value: string) => { expect(column).toBe("recipient_id"); recipient = value; return query; },
        is: () => query, order: () => query, limit: () => query,
        then(resolve: (value: unknown) => unknown) {
          reads.push({ recipient, head });
          return Promise.resolve(head ? { count: recipient === "student-a" ? 1 : 2, error: null }
            : { data: [], error: failList ? { code: "57014" } : null }).then(resolve);
        },
      };
      return query;
    },
  }));
});

it("authenticates once and reuses one RLS client for the count and list", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ unreadCount: 1, items: [] });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
  expect(mocks.requireUser).not.toHaveBeenCalled();
  expect(mocks.createClient).toHaveBeenCalledTimes(1);
  expect(reads).toEqual(expect.arrayContaining([{ recipient: user.id, head: true }, { recipient: user.id, head: false }]));
  expect(reads).toHaveLength(2);
});

it("returns 401 without querying notifications when signed out", async () => {
  mocks.getCurrentUser.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("keeps concurrent students' identities and summaries separate", async () => {
  mocks.getCurrentUser.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, id: "student-b" });
  const responses = await Promise.all([GET(), GET()]);
  expect(await Promise.all(responses.map((r) => r.json()))).toEqual([{ unreadCount: 1, items: [] }, { unreadCount: 2, items: [] }]);
  expect(reads.filter((r) => r.recipient === "student-a")).toHaveLength(2);
  expect(reads.filter((r) => r.recipient === "student-b")).toHaveLength(2);
});

it("keeps the safe 503 response on a notification read failure", async () => {
  failList = true;
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Notifications are unavailable." });
});

it("still verifies the user once for Server Component callers", async () => {
  expect(await getMyNotificationSummary()).toEqual({ unreadCount: 1, items: [] });
  expect(mocks.requireUser).toHaveBeenCalledTimes(1);
  expect(mocks.createClient).toHaveBeenCalledTimes(1);
});
