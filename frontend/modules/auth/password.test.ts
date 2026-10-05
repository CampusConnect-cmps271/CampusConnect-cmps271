import { describe, expect, it } from "vitest";
import {
  isAcceptablePassword,
  MIN_PASSWORD_LENGTH,
  PASSWORD_SYMBOLS,
  passwordProblems,
} from "./password";

describe("password policy", () => {
  it("accepts a password meeting every rule", () => {
    expect(passwordProblems("CampusConnect1!")).toEqual([]);
    expect(isAcceptablePassword("CampusConnect1!")).toBe(true);
  });

  it("requires the minimum length", () => {
    // Meets every class but is one character short.
    const short = "Ab1!cde";
    expect(short).toHaveLength(MIN_PASSWORD_LENGTH - 1);
    expect(passwordProblems(short)).toEqual([
      `Be at least ${MIN_PASSWORD_LENGTH} characters long`,
    ]);
  });

  it("requires each character class", () => {
    expect(passwordProblems("ABCDEFG1!")).toEqual([
      "Contain a lowercase letter",
    ]);
    expect(passwordProblems("abcdefg1!")).toEqual([
      "Contain an uppercase letter",
    ]);
    expect(passwordProblems("Abcdefgh!")).toEqual(["Contain a digit"]);
    expect(passwordProblems("Abcdefg1")).toEqual([
      "Contain a symbol, for example ! ? @ #",
    ]);
  });

  it("reports every unmet rule at once", () => {
    expect(passwordProblems("abc")).toEqual([
      `Be at least ${MIN_PASSWORD_LENGTH} characters long`,
      "Contain an uppercase letter",
      "Contain a digit",
      "Contain a symbol, for example ! ? @ #",
    ]);
  });

  it("rejects an empty password with every rule", () => {
    expect(passwordProblems("")).toHaveLength(5);
    expect(isAcceptablePassword("")).toBe(false);
  });

  // The classes below mirror Supabase Auth exactly; these were confirmed
  // against the running server, so a password the form accepts is one the
  // server accepts.
  it("accepts every symbol Supabase counts as a symbol", () => {
    for (const symbol of PASSWORD_SYMBOLS) {
      expect(
        passwordProblems(`Abcdefg1${symbol}`),
        `symbol ${symbol} should satisfy the rule`,
      ).toEqual([]);
    }
  });

  it("does not treat a space as a symbol", () => {
    expect(passwordProblems("Abcdefg1 ")).toEqual([
      "Contain a symbol, for example ! ? @ #",
    ]);
  });

  it("does not count non-ASCII characters towards the classes", () => {
    // Supabase uses strict ASCII sets, so these must fail here too.
    expect(passwordProblems("Ébcdefg1!")).toEqual([
      "Contain an uppercase letter",
    ]);
    expect(passwordProblems("ABCDEFGé1!")).toEqual([
      "Contain a lowercase letter",
    ]);
    expect(passwordProblems("Abcdefgh١!")).toEqual(["Contain a digit"]);
    expect(passwordProblems("Abcdefg1€")).toEqual([
      "Contain a symbol, for example ! ? @ #",
    ]);
  });
});
