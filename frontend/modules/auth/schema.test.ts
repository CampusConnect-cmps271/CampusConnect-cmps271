import * as z from "zod";
import { describe, expect, it } from "vitest";
import {
  createLoginSchema,
  DEFAULT_ALLOWED_EMAIL_DOMAINS,
  emailDomainMessage,
  parseAllowedEmailDomains,
} from "./schema";

const schema = createLoginSchema(["mail.aub.edu"]);

function fieldErrors(input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) return null;
  return z.flattenError(result.error).fieldErrors;
}

describe("parseAllowedEmailDomains", () => {
  it("splits a comma-separated list", () => {
    expect(parseAllowedEmailDomains("mail.aub.edu,aub.edu.lb")).toEqual([
      "mail.aub.edu",
      "aub.edu.lb",
    ]);
  });

  it("trims whitespace, lowercases, and drops a leading @", () => {
    expect(parseAllowedEmailDomains(" @Mail.AUB.edu , AUB.edu.lb ")).toEqual([
      "mail.aub.edu",
      "aub.edu.lb",
    ]);
  });

  it("falls back to the default when unset or empty", () => {
    expect(parseAllowedEmailDomains(undefined)).toEqual(
      DEFAULT_ALLOWED_EMAIL_DOMAINS,
    );
    expect(parseAllowedEmailDomains("   ")).toEqual(
      DEFAULT_ALLOWED_EMAIL_DOMAINS,
    );
    expect(parseAllowedEmailDomains(",,")).toEqual(
      DEFAULT_ALLOWED_EMAIL_DOMAINS,
    );
  });
});

describe("login schema", () => {
  it("accepts a university email and a password", () => {
    const result = schema.safeParse({
      email: "student@mail.aub.edu",
      password: "CampusConnect1",
    });

    expect(result.success).toBe(true);
  });

  it("normalises the email to trimmed lowercase", () => {
    const result = schema.safeParse({
      email: "  Student@Mail.AUB.edu  ",
      password: "CampusConnect1",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("student@mail.aub.edu");
  });

  it("requires the email", () => {
    expect(fieldErrors({ email: "", password: "CampusConnect1" })?.email).toEqual(
      ["Email is required"],
    );
    expect(
      fieldErrors({ email: "   ", password: "CampusConnect1" })?.email,
    ).toEqual(["Email is required"]);
    expect(
      fieldErrors({ email: null, password: "CampusConnect1" })?.email,
    ).toEqual(["Email is required"]);
  });

  it("requires the password", () => {
    expect(
      fieldErrors({ email: "student@mail.aub.edu", password: "" })?.password,
    ).toEqual(["Password is required"]);
    expect(
      fieldErrors({ email: "student@mail.aub.edu", password: null })?.password,
    ).toEqual(["Password is required"]);
  });

  it("rejects a malformed email", () => {
    expect(
      fieldErrors({ email: "not-an-email", password: "CampusConnect1" })?.email,
    ).toEqual(["Enter a valid email address"]);
  });

  it("rejects an email outside the allowed domains", () => {
    expect(
      fieldErrors({ email: "student@gmail.com", password: "CampusConnect1" })
        ?.email,
    ).toEqual([emailDomainMessage(["mail.aub.edu"])]);
  });

  it("is not fooled by the allowed domain appearing earlier in the address", () => {
    expect(
      fieldErrors({
        email: "student@mail.aub.edu.evil.test",
        password: "CampusConnect1",
      })?.email,
    ).toEqual([emailDomainMessage(["mail.aub.edu"])]);

    expect(
      fieldErrors({
        email: "mail.aub.edu@gmail.com",
        password: "CampusConnect1",
      })?.email,
    ).toEqual([emailDomainMessage(["mail.aub.edu"])]);
  });

  it("reports one message per field, not a pile", () => {
    const errors = fieldErrors({ email: "nope", password: "" });

    expect(errors?.email).toHaveLength(1);
    expect(errors?.password).toHaveLength(1);
  });

  it("honours a multi-domain allow-list", () => {
    const multi = createLoginSchema(["mail.aub.edu", "aub.edu.lb"]);

    expect(
      multi.safeParse({
        email: "staff@aub.edu.lb",
        password: "CampusConnect1",
      }).success,
    ).toBe(true);
  });

  it("does not enforce the registration password policy", () => {
    // An existing account may predate a policy change; only registration cares.
    expect(
      schema.safeParse({ email: "student@mail.aub.edu", password: "x" })
        .success,
    ).toBe(true);
  });
});

describe("emailDomainMessage", () => {
  it("lists one domain", () => {
    expect(emailDomainMessage(["mail.aub.edu"])).toBe(
      "Use your university email (@mail.aub.edu)",
    );
  });

  it("lists several domains", () => {
    expect(emailDomainMessage(["mail.aub.edu", "aub.edu.lb"])).toBe(
      "Use your university email (@mail.aub.edu or @aub.edu.lb)",
    );
  });
});
