import { describe, expect, it } from "vitest";
import { groupErrorLogs, type ErrorLogRow } from "./dashboard";

const rows: ErrorLogRow[] = [
  {
    id: "1",
    created_at: "2026-10-05T12:00:00.000Z",
    source: "client",
    event: "frontend.error.uncaught",
    message: "render failed",
    user_id: "user-a",
    context: { page: "/home" },
  },
  {
    id: "2",
    created_at: "2026-10-05T12:05:00.000Z",
    source: "client",
    event: "frontend.error.uncaught",
    message: "render failed again",
    user_id: "user-b",
    context: { page: "/clubs" },
  },
  {
    id: "3",
    created_at: "2026-10-05T12:03:00.000Z",
    source: "server",
    event: "backend.error.unexpected",
    message: "query failed",
    user_id: "user-a",
    context: { path: "/api/clubs" },
  },
];

describe("groupErrorLogs", () => {
  it("groups by source and event and counts affected accounts", () => {
    const groups = groupErrorLogs(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      event: "frontend.error.uncaught",
      source: "client",
      count: 2,
      affectedAccounts: 2,
      lastSeen: "2026-10-05T12:05:00.000Z",
      samplePath: "/home",
    });
    expect(groups[1]).toMatchObject({
      event: "backend.error.unexpected",
      source: "server",
      count: 1,
      affectedAccounts: 1,
    });
  });

  it("returns an empty dashboard for no rows", () => {
    expect(groupErrorLogs([])).toEqual([]);
  });
});
