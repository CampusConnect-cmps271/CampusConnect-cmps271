/** Shared classes for the communities pages. A plain module, so Server and Client Components can both use it. */

export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

export const FIELD_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)] aria-[invalid=true]:border-[var(--danger)]";

export const LABEL_CLASS = "block text-sm font-semibold text-[var(--ink)]";

export const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] disabled:opacity-60 ${FOCUS}`;

export const SECONDARY_BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--maroon-200)] hover:bg-[var(--maroon-50)] disabled:opacity-60 ${FOCUS}`;

export const DANGER_BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--danger)] bg-white px-4 py-2 text-sm font-semibold text-[var(--danger)] hover:bg-[#fdecea] disabled:opacity-60 ${FOCUS}`;

export const CARD = "rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]";

export const SECTION_HEADING = "text-lg font-semibold text-[var(--ink)]";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Beirut" });

/** "17 Nov 2026", in Beirut time. */
export function formatDate(value: string): string {
  return DATE.format(new Date(value));
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
