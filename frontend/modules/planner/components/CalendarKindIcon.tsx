import type { ViewEntryKind } from "../calendar-view";

const PATHS: Record<ViewEntryKind, string> = {
  // An open book.
  class: "M2 3.5c2-.8 4-.8 6 .5 2-1.3 4-1.3 6-.5v9c-2-.8-4-.8-6 .5-2-1.3-4-1.3-6-.5zM8 4v9",
  // A check in a box.
  item: "M3 3h10v10H3zM5.5 8.2 7.3 10 10.8 6",
  // A calendar page with a star point.
  event: "M3 4h10v9H3zM3 7h10M6 2.5v3M10 2.5v3M8 8.5l.6 1.2 1.3.2-1 .9.3 1.3L8 11.5l-1.2.6.3-1.3-1-.9 1.3-.2z",
  // A bookmark.
  saved: "M4.5 2.5h7v11L8 10.5l-3.5 3z",
  // A calendar page struck through.
  cancelled: "M3 4h10v9H3zM3 7h10M6 2.5v3M10 2.5v3M5.5 8.5l5 3.5M10.5 8.5l-5 3.5",
  // A bell.
  reminder: "M8 2.5a3.5 3.5 0 0 1 3.5 3.5v3l1.5 2H3l1.5-2V6A3.5 3.5 0 0 1 8 2.5zM6.5 12.5a1.5 1.5 0 0 0 3 0",
};

/** A small picture of what an entry is. Decorative: the entry also names its kind in words. */
export function CalendarKindIcon({ kind }: { kind: ViewEntryKind }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      <path d={PATHS[kind]} />
    </svg>
  );
}
