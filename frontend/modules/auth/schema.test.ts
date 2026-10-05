import * as z from "zod";
import { describe, expect, it } from "vitest";
import {
  createLoginSchema,
  createRegisterSchema,
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

const registerSchemaForTests = createRegisterSchema(["mail.aub.edu"]);

function registerErrors(input: unknown) {
  const result = registerSchemaForTests.safeParse(input);
  if (result.success) return null;
  return z.flattenError(result.error).fieldErrors;
}

const VALID_REGISTRATION = {
  fullName: "Test Student",
  email: "student@mail.aub.edu",
  password: "CampusConnect1!",
  confirmPassword: "CampusConnect1!",
};

describe("register schema", () => {
  it("accepts a complete, valid registration", () => {
    const result = registerSchemaForTests.safeParse(VALID_REGISTRATION);
    expect(result.success).toBe(true);
  });

  it("normalises the name and the email", () => {
    const result = registerSchemaForTests.safeParse({
      ...VALID_REGISTRATION,
      fullName: "  Test   Student  ",
      email: "  Student@Mail.AUB.edu ",
    });

    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBe("Test Student");
    expect(result.data?.email).toBe("student@mail.aub.edu");
  });

  it("requires the name", () => {
    expect(
      registerErrors({ ...VALID_REGISTRATION, fullName: "   " })?.fullName,
    ).toEqual(["Name is required"]);
    expect(
      registerErrors({ ...VALID_REGISTRATION, fullName: "A" })?.fullName,
    ).toEqual(["Name must be at least 2 characters long"]);
  });

  it("applies the same university-email rule as login", () => {
    expect(
      registerErrors({ ...VALID_REGISTRATION, email: "student@gmail.com" })
        ?.email,
    ).toEqual([emailDomainMessage(["mail.aub.edu"])]);
  });

  it("enforces the password policy, unlike login", () => {
    const errors = registerErrors({
      ...VALID_REGISTRATION,
      password: "weak",
      confirmPassword: "weak",
    });

    expect(errors?.password).toContain("Contain an uppercase letter");
    expect(errors?.password).toContain("Contain a digit");
  });

  it("requires the two passwords to match", () => {
    expect(
      registerErrors({
        ...VALID_REGISTRATION,
        confirmPassword: "CampusConnect2!",
      })?.confirmPassword,
    ).toEqual(["Passwords do not match"]);
  });

  it("asks for the confirmation before complaining that it differs", () => {
    // An empty confirmation should read as "confirm it", not "they differ".
    expect(
      registerErrors({ ...VALID_REGISTRATION, confirmPassword: "" })
        ?.confirmPassword,
    ).toEqual(["Confirm your password"]);
  });

  it("reports problems on every bad field at once", () => {
    const errors = registerErrors({
      fullName: "",
      email: "nope",
      password: "",
      confirmPassword: "",
    });

    expect(errors?.fullName).toEqual(["Name is required"]);
    expect(errors?.email).toEqual(["Enter a valid email address"]);
    expect(errors?.password).toEqual(["Password is required"]);
    expect(errors?.confirmPassword).toEqual(["Confirm your password"]);
  });
});
