/**
 * Credit totals in integer hundredths. Catalogue credits are numeric(5,2),
 * so every value is a whole number of hundredths and the sum is exact;
 * adding the decimals as floating-point numbers is not (1.1 + 2.2).
 */

/** "3", "3.25", 1.1 or "1.10" as hundredths (300, 325, 110, 110). */
export function creditHundredths(credits: number | string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(credits).trim());
  if (!match) throw new RangeError("Catalogue credits must have at most two decimal places.");
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function totalCreditHundredths(courses: readonly { credits: number | string }[]): number {
  return courses.reduce((total, course) => total + creditHundredths(course.credits), 0);
}

/** 700 -> "7", 330 -> "3.3", 625 -> "6.25", the way the course pages show credits. */
export function formatCredits(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** "7 credits", "1 credit". */
export function creditLabel(hundredths: number): string {
  return `${formatCredits(hundredths)} ${hundredths === 100 ? "credit" : "credits"}`;
}
