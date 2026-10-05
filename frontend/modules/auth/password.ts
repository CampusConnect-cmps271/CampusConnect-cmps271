/**
 * The password policy, in one place.
 *
 * This MUST mirror supabase/config.toml:
 *   minimum_password_length = 8
 *   password_requirements   = "lower_upper_letters_digits_symbols"
 * and the matching settings on the hosted project (Authentication ->
 * Sign In / Providers -> Password). If the form is looser than the server, a
 * student gets a green form and then a `weak_password` rejection; if it is
 * stricter, we refuse passwords the server would have taken.
 *
 * The character sets below are the ones Supabase Auth actually uses. They were
 * confirmed against the running server, not inferred: the classes are strict
 * ASCII, so an accented letter or an Arabic-Indic digit does NOT satisfy the
 * letter or digit rule, and a space is not a symbol.
 */

export const MIN_PASSWORD_LENGTH = 8;

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
/** Exactly what Supabase Auth counts as a symbol. Space is not included. */
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};':\"|<>?,./\\~`";

/** Membership tests, so no regex escaping can quietly change the rule. */
function containsAny(value: string, allowed: string): boolean {
  const set = new Set(allowed);
  for (const character of value) {
    if (set.has(character)) return true;
  }
  return false;
}

export type PasswordRule = {
  id: "length" | "lowercase" | "uppercase" | "digit" | "symbol";
  /** Shown to the student, both as a hint and as an error. */
  label: string;
  isMet: (value: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `Be at least ${MIN_PASSWORD_LENGTH} characters long`,
    isMet: (value) => value.length >= MIN_PASSWORD_LENGTH,
  },
  {
    id: "lowercase",
    label: "Contain a lowercase letter",
    isMet: (value) => containsAny(value, LOWERCASE),
  },
  {
    id: "uppercase",
    label: "Contain an uppercase letter",
    isMet: (value) => containsAny(value, UPPERCASE),
  },
  {
    id: "digit",
    label: "Contain a digit",
    isMet: (value) => containsAny(value, DIGITS),
  },
  {
    id: "symbol",
    label: "Contain a symbol, for example ! ? @ #",
    isMet: (value) => containsAny(value, PASSWORD_SYMBOLS),
  },
];

/** Every rule the password fails, in order. Empty means it is acceptable. */
export function passwordProblems(value: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.isMet(value)).map(
    (rule) => rule.label,
  );
}

export function isAcceptablePassword(value: string): boolean {
  return passwordProblems(value).length === 0;
}

/** One-line summary for the field hint and the weak_password message. */
export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, with a lowercase letter, an uppercase letter, a digit and a symbol.`;
