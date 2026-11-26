import { describe, expect, it } from "vitest";
import type { ApiAvailabilityRow } from "./dashboard-server";
import { summarizeApiAvailability } from "./availability-dashboard";

function row(
  total_requests: number,
  successful_requests: number,
  client_errors: number,
  server_errors: number,
): ApiAvailabilityRow {
  return {
    endpoint: "/api/example",
    method: "GET",
    total_requests,
    successful_requests,
    client_errors,
    server_errors,
    availability_percent: null,
  };
}

describe("availability dashboard summary", () => {
  it("shows no uptime percentage when there are no recorded requests", () => {
    expect(summarizeApiAvailability([])).toEqual({
      total_requests: 0,
      successful_requests: 0,
      client_errors: 0,
      server_errors: 0,
      availability_percent: null,
    });
  });

  it("combines counts and calculates availability across endpoints", () => {
    expect(summarizeApiAvailability([row(10, 8, 1, 1), row(5, 2, 3, 0)])).toEqual({
      total_requests: 15,
      successful_requests: 10,
      client_errors: 4,
      server_errors: 1,
      availability_percent: 93.33,
    });
  });

  it("weights by request count rather than averaging endpoint percentages", () => {
    expect(
      summarizeApiAvailability([row(100, 99, 0, 1), row(1, 0, 0, 1)])
        .availability_percent,
    ).toBe(98.02);
  });

  it("counts client errors as available, not as server outages", () => {
    expect(summarizeApiAvailability([row(4, 0, 4, 0)]).availability_percent).toBe(100);
  });
});
