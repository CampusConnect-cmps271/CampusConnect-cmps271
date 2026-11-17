import type { CalendarEntryKind } from "../calendar";

/** Planner styles shared by server and client components, so not in a "use client" file. */

export const PANEL = "flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]";
export const PANEL_HEADING = "text-base font-semibold text-[var(--ink)]";

export const KIND_NAME: Record<CalendarEntryKind, string> = {
  class: "Class",
  item: "Your item",
  event: "Event",
};

export const KIND_STYLE: Record<CalendarEntryKind, string> = {
  class: "border-[var(--maroon)] bg-[var(--maroon-100)] text-[var(--maroon-deep)]",
  item: "border-[#b26a00] bg-[#fff1d6] text-[#4d2d00]",
  event: "border-[#2f6f8f] bg-[#e1f0f7] text-[#143847]",
};

export const CONFLICT_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #fdecea 0 5px, #f8d2cd 5px 10px)",
};
