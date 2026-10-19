/** Accept readable route codes while retaining leading zeros and suffixes. */
export function normalizeCourseCode(value: string): string | null {
  const match = /^([A-Z]{2,8})[\s-]*(\d{3}[A-Z]{0,3})$/i.exec(value.trim());
  return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : null;
}

export const MAX_COMPARISON_COURSES = 3;

export function parseComparisonSelection(value: string | string[] | undefined) {
  const values = value === undefined ? [] : typeof value === "string" ? [value] : value;
  const codes: string[] = [];
  let error: string | undefined;
  // Bound processing of hand-written URLs as well as the eventual database read.
  if (values.length > 10) return { codes, error: "Choose no more than three courses." };
  for (const value of values) {
    const code = value.length <= 32 ? normalizeCourseCode(value) : null;
    if (!code) { error = "One of the selected course codes is invalid. Choose courses from the catalogue."; continue; }
    if (!codes.includes(code)) codes.push(code);
  }
  if (codes.length > MAX_COMPARISON_COURSES) error = "Choose no more than three courses.";
  return { codes: codes.slice(0, MAX_COMPARISON_COURSES), error };
}
