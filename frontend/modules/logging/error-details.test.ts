import { describe, expect, it } from "vitest";
import {
  accountIdFromHeaders,
  clientErrorContext,
  describeError,
  pathnameOnly,
} from "./error-details";

describe("describeError", () => {
  it("keeps the error name, message, digest and a bounded stack", () => {
    const error = new Error("database failed") as Error & { digest?: string };
    error.digest = "next-digest";
    error.stack = ["Error: database failed", ...Array.from({ length: 20 }, (_, i) => `at frame-${i}`)].join("\n");

    const details = describeError(error);
    expect(details.name).toBe("Error");
    expect(details.message).toBe("database failed");
    expect(details.digest).toBe("next-digest");
    expect(details.stack).toHaveLength(12);
  });

  it("normalises non-Error thrown values", () => {
    expect(describeError("failed")).toEqual({
      name: "UnknownError",
      message: "failed",
      stack: [],
    });
  });
});

describe("safe request context", () => {
  it("drops query strings and fragments from paths", () => {
    expect(pathnameOnly("/search?email=student@mail.aub.edu#result")).toBe("/search");
  });

  it("accepts only UUID-shaped verified account headers", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(accountIdFromHeaders({ "x-account-id": id })).toBe(id);
    expect(accountIdFromHeaders({ "X-Account-ID": "not-a-uuid" })).toBeNull();
    expect(accountIdFromHeaders({})).toBeNull();
  });

  it("records the page, browser and stack for a frontend error", () => {
    const error = new Error("render failed");
    error.stack = "Error: render failed\n at Profile";

    expect(
      clientErrorContext(
        error,
        {
          page: "https://campusconnect.test/home?private=value",
          browser: "Test Browser",
        },
        { line: 12 },
      ),
    ).toEqual({
      page: "/home",
      browser: "Test Browser",
      error_name: "Error",
      stack: ["Error: render failed", "at Profile"],
      line: 12,
    });
  });
});
