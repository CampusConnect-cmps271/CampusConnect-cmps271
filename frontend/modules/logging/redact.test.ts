import { describe, expect, it } from "vitest";
import {
  isSensitiveKey,
  maskEmails,
  redact,
  redactMessage,
  REDACTED,
} from "./redact";

describe("isSensitiveKey", () => {
  const sensitive = [
    "password",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "cookie",
    "secret",
    "body",
    "content",
  ];

  it.each(sensitive)("treats %s as sensitive", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it("ignores case and separators", () => {
    for (const key of [
      "Password",
      "PASSWORD",
      "accessToken",
      "access-token",
      "ACCESS_TOKEN",
      "X-Authorization",
      "Set-Cookie",
      "apiKey",
      "refreshTokenValue",
      "userPassword",
    ]) {
      expect(isSensitiveKey(key), `${key} should be sensitive`).toBe(true);
    }
  });

  it("leaves ordinary keys alone", () => {
    for (const key of ["event", "code", "status", "email", "userId", "count"]) {
      expect(isSensitiveKey(key), `${key} should not be sensitive`).toBe(false);
    }
  });
});

describe("redact", () => {
  it("drops every sensitive value but keeps the key", () => {
    const result = redact({
      password: "CampusConnect1!",
      token: "abc.def.ghi",
      access_token: "eyJhbGciOi",
      refresh_token: "r3fr3sh",
      authorization: "Bearer abc",
      cookie: "sb-access-token=xyz",
      secret: "sb_secret_live",
      body: "the private message text",
      content: "also private",
      event: "auth.login.failure",
    });

    for (const key of [
      "password",
      "token",
      "access_token",
      "refresh_token",
      "authorization",
      "cookie",
      "secret",
      "body",
      "content",
    ]) {
      expect(result[key], `${key} should be redacted`).toBe(REDACTED);
    }

    expect(result.event).toBe("auth.login.failure");
  });

  it("never lets a secret value survive anywhere in the output", () => {
    const serialised = JSON.stringify(
      redact({
        password: "hunter2",
        nested: { refreshToken: "r3fr3sh", deeper: { secret: "sb_secret" } },
        list: [{ authorization: "Bearer leak" }],
      }),
    );

    expect(serialised).not.toContain("hunter2");
    expect(serialised).not.toContain("r3fr3sh");
    expect(serialised).not.toContain("sb_secret");
    expect(serialised).not.toContain("Bearer leak");
  });

  it("redacts inside nested objects", () => {
    const result = redact({
      request: { headers: { authorization: "Bearer abc", accept: "json" } },
    });

    const request = result.request as Record<string, Record<string, unknown>>;
    expect(request.headers.authorization).toBe(REDACTED);
    expect(request.headers.accept).toBe("json");
  });

  it("redacts inside arrays, including arrays of objects", () => {
    const result = redact({
      attempts: [
        { password: "one", code: "invalid_credentials" },
        { password: "two", code: "invalid_credentials" },
      ],
    });

    const attempts = result.attempts as Array<Record<string, unknown>>;
    expect(attempts).toHaveLength(2);
    expect(attempts[0].password).toBe(REDACTED);
    expect(attempts[1].password).toBe(REDACTED);
    expect(attempts[0].code).toBe("invalid_credentials");
  });

  it("masks emails wherever they appear", () => {
    const result = redact({
      email: "test.student@mail.aub.edu",
      note: "login failed for nadia.khoury@mail.aub.edu at 10:00",
      list: ["omar.saad@mail.aub.edu"],
    });

    expect(result.email).toBe("t***@mail.aub.edu");
    expect(result.note).toBe("login failed for n***@mail.aub.edu at 10:00");
    expect((result.list as string[])[0]).toBe("o***@mail.aub.edu");
  });

  it("truncates long strings", () => {
    const result = redact({ note: "x".repeat(500) });
    const note = result.note as string;

    expect(note.length).toBeLessThan(500);
    expect(note.endsWith("[truncated]")).toBe(true);
  });

  it("caps long arrays instead of storing all of them", () => {
    const result = redact({ items: Array.from({ length: 50 }, (_, i) => i) });
    const items = result.items as unknown[];

    expect(items).toHaveLength(21);
    expect(items[20]).toBe("[30 more]");
  });

  it("stops at a depth limit rather than recursing forever", () => {
    const deep = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };
    expect(JSON.stringify(redact(deep))).toContain("depth limit");
  });

  it("survives a circular reference", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    expect(() => redact(circular)).not.toThrow();
    expect(JSON.stringify(redact(circular))).toContain("circular");
  });

  it("normalises awkward values", () => {
    const result = redact({
      when: new Date("2026-10-05T10:00:00.000Z"),
      failure: new Error("boom at a@b.com"),
      nothing: null,
      big: BigInt(10),
    });

    expect(result.when).toBe("2026-10-05T10:00:00.000Z");
    expect(result.failure).toEqual({ name: "Error", message: "boom at a***@b.com" });
    expect(result.nothing).toBeNull();
    expect(result.big).toBe("10");
  });

  it("returns an empty object for anything that is not a context", () => {
    expect(redact(undefined)).toEqual({});
    expect(redact(null)).toEqual({});
  });
});

describe("maskEmails", () => {
  it("keeps one character of the local part", () => {
    expect(maskEmails("student@mail.aub.edu")).toBe("s***@mail.aub.edu");
  });

  it("masks several addresses in one string", () => {
    expect(maskEmails("a@x.com and bb@y.org")).toBe("a***@x.com and b***@y.org");
  });

  it("leaves text without an address alone", () => {
    expect(maskEmails("no address here")).toBe("no address here");
  });
});

describe("redactMessage", () => {
  it("masks and keeps the message", () => {
    expect(redactMessage("failed for a@b.com")).toBe("failed for a***@b.com");
  });

  it("returns null for nothing useful", () => {
    expect(redactMessage(undefined)).toBeNull();
    expect(redactMessage("")).toBeNull();
  });
});
