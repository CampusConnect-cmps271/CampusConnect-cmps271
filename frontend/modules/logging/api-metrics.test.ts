
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./log", () => ({
  log: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("server-only", () => ({}));

import { log } from "./log";
import { trackApiRequest } from "./api-metrics";

describe("API request metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records successful requests", async () => {
    const handler = trackApiRequest(
      "/api/notifications",
      "GET",
      async () => new Response("OK", { status: 200 }),
    );

    const response = await handler();

    expect(response.status).toBe(200);
    expect(log.info).toHaveBeenCalledOnce();

    expect(log.info).toHaveBeenCalledWith(
      "api.request.completed",
      expect.objectContaining({
        endpoint: "/api/notifications",
        method: "GET",
        status: 200,
        duration_ms: expect.any(Number),
      }),
    );
  });

  it("records failed HTTP responses", async () => {
    const handler = trackApiRequest(
      "/api/notifications",
      "GET",
      async () => new Response("Unavailable", { status: 503 }),
    );

    await handler();

    expect(log.error).toHaveBeenCalledWith(
      "api.request.completed",
      expect.objectContaining({
        status: 503,
      }),
    );
  });

  it("records errors without hiding the original exception", async () => {
    const handler = trackApiRequest(
      "/api/notifications",
      "GET",
      async (): Promise<Response> => {
        throw new Error("Database unavailable");
      },
    );

    await expect(handler()).rejects.toThrow("Database unavailable");

    expect(log.error).toHaveBeenCalledWith(
      "api.request.completed",
      expect.objectContaining({
        status: 500,
      }),
    );
  });

  it("records unauthorized requests", async () => {
    const handler = trackApiRequest(
      "/api/notifications",
      "GET",
      async () => new Response("Unauthorized", { status: 401 }),
    );

    await handler();

    expect(log.warn).toHaveBeenCalledWith(
      "api.request.completed",
      expect.objectContaining({
        status: 401,
      }),
    );
  });
});
