
import { describe, expect, it } from "vitest";
import { calculateAvailability } from "./availability";

describe("API availability calculation", () => {
  it("calculates availability correctly", () => {
    const requests = [
      { status: 200 },
      { status: 200 },
      { status: 404 },
      { status: 500 },
    ];

    const result = calculateAvailability(requests);

    expect(result.totalRequests).toBe(4);
    expect(result.successfulRequests).toBe(2);
    expect(result.clientErrors).toBe(1);
    expect(result.serverErrors).toBe(1);
    expect(result.availabilityPercent).toBe(75);
  });

  it("does not count 4xx errors as downtime", () => {
    const result = calculateAvailability([
      { status: 200 },
      { status: 400 },
      { status: 401 },
      { status: 404 },
    ]);

    expect(result.availabilityPercent).toBe(100);
    expect(result.clientErrors).toBe(3);
  });

  it("counts 5xx errors as downtime", () => {
    const result = calculateAvailability([
      { status: 200 },
      { status: 500 },
      { status: 503 },
    ]);

    expect(result.serverErrors).toBe(2);
    expect(result.availabilityPercent).toBe(33.33);
  });

  it("handles zero requests", () => {
    const result = calculateAvailability([]);

    expect(result.availabilityPercent).toBeNull();
    expect(result.totalRequests).toBe(0);
  });

  it("rejects invalid status codes", () => {
    expect(() =>
      calculateAvailability([{ status: 999 }]),
    ).toThrow("Invalid HTTP status");
  });
});
