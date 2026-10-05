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

/**
 * Supabase hashes with bcrypt, which only reads the first 72 bytes, so it
 * rejects anything longer outright. Confirmed against the running server: 72
 * characters is accepted, 73 comes back as validation_failed. Without this
 * rule a long passphrase passes the form and then fails on the server with a
 * code we do not map, showing the student a generic error on a clean form.
 */
export const MAX_PASSWORD_LENGTH = 72;

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
/** Exactly what Supabase Auth counts as a symbol. Space is not included. */
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};':\"|<>?,./\\~`";

/**
 * Membership tests, so no regex escaping can quietly change the rule. The sets
 * are built once: they are module constants in disguise, and rebuilding them
 * per check is pure waste on the auth path.
 */
const CHARACTER_SETS = new Map<string, Set<string>>();

function containsAny(value: string, allowed: string): boolean {
  let set = CHARACTER_SETS.get(allowed);
  if (!set) {
    set = new Set(allowed);
    CHARACTER_SETS.set(allowed, set);
  }

  for (const character of value) {
    if (set.has(character)) return true;
  }
  return false;
}

export type PasswordRule = {
  id: "length" | "maxLength" | "lowercase" | "uppercase" | "digit" | "symbol";
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
    id: "maxLength",
    label: `Be at most ${MAX_PASSWORD_LENGTH} characters long`,
    isMet: (value) => value.length <= MAX_PASSWORD_LENGTH,
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
