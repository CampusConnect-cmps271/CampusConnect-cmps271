import { CalendarPlus, CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";
import type { ConflictReport, ConflictSide } from "../conflicts";
import { conflictHeadline, invalidItemHelp, invalidMeetingHelp, overlapDates, overlapWindow } from "../conflict-text";
import type { PlanDetails, PlannerEvent } from "../types";

const STYLES = {
  conflicts: { Icon: TriangleAlert, box: "border-[var(--danger)] bg-[#fdecea]", icon: "text-[var(--danger)]" },
  incomplete: { Icon: CircleHelp, box: "border-[#b26a00] bg-[#fff6e5]", icon: "text-[#8a5300]" },
  clear: { Icon: CircleCheck, box: "border-[var(--success)] bg-[#eaf6ee]", icon: "text-[var(--success)]" },
  empty: { Icon: CalendarPlus, box: "border-[var(--border)] bg-white", icon: "text-[var(--ink-soft)]" },
} as const;

const LINK = "font-semibold text-[var(--maroon)] underline";

/**
 * The plan's conflict status, from the engine's report on the saved data:
 * classes, the student's own items and the events they are going to.
 * An aria-live region, so a new or fixed conflict is announced when the
 * page re-renders after an action.
 */
export function ConflictPanel({ plan, events, report }: { plan: PlanDetails; events: readonly PlannerEvent[]; report: ConflictReport }) {
  const { Icon, box, icon } = STYLES[report.status];
  const courses = new Map(plan.courses.map((planned) => [planned.plan_course_id, planned]));
  const meetings = new Map(plan.courses.flatMap((planned) => planned.meetings.map((meeting) => [meeting.id, meeting] as const)));
  const items = new Map(plan.items.map((item) => [item.id, item]));
  const eventTitles = new Map(events.map((event) => [event.id, event.title]));

  const label = (side: ConflictSide) => {
    if (side.kind === "meeting") return { href: `#meeting-${side.meeting_id}`, text: courses.get(side.plan_course_id)?.code ?? "A course" };
    if (side.kind === "item") return { href: `#item-${side.item_id}`, text: items.get(side.item_id)?.title ?? "An item" };
    return { href: `#event-${side.event_id}`, text: eventTitles.get(side.event_id) ?? "An event" };
  };
  const link = (side: ConflictSide, text = label(side).text) => (
    <a href={label(side).href} className={LINK}>
      {text}
    </a>
  );

  return (
    <section aria-labelledby="conflict-status-heading" className="flex flex-col gap-3">
      <div aria-live="polite" className={`flex gap-3 rounded-lg border-2 px-4 py-3 ${box}`}>
        <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${icon}`} />
        <div className="flex min-w-0 flex-col gap-2 text-sm text-[var(--ink)]">
          <h2 id="conflict-status-heading" className="text-base font-semibold">
            {conflictHeadline(report)}
          </h2>

          {report.status === "conflicts" ? (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {report.conflicts.map((conflict, index) => {
                const [first, second] = conflict.sides;
                const when = `${overlapWindow(conflict)} (Beirut time), ${overlapDates(conflict)}`;
                const sameCourse =
                  first.kind === "meeting" && second.kind === "meeting" && first.plan_course_id === second.plan_course_id;
                return (
                  <li key={`${label(first).href}-${label(second).href}-${index}`}>
                    {sameCourse ? (
                      <>
                        Two of {link(first)}&apos;s {link(second, "meetings")} overlap on {when}.
                      </>
                    ) : (
                      <>
                        {link(first)} and {link(second)} overlap on {when}.
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {report.unknown.length && report.status !== "empty" ? (
            <p>
              {report.status === "conflicts" ? "Also, these courses have no times yet: " : "No times yet: "}
              {report.unknown.map((unknown, index) => (
                <span key={unknown.plan_course_id}>
                  {index ? ", " : ""}
                  <a href={`#course-${unknown.plan_course_id}`} className={LINK}>
                    {courses.get(unknown.plan_course_id)?.code ?? "a course"}
                  </a>
                </span>
              ))}
              . A course without times could still clash.
            </p>
          ) : null}

          {report.status === "empty" ? <p>Add courses and their meeting times to check them for overlaps.</p> : null}
        </div>
      </div>

      {report.invalid.length ? (
        <div className="rounded-lg border border-[var(--danger)] bg-white px-4 py-3 text-sm text-[var(--ink)]">
          <h3 className="font-semibold">Times to fix</h3>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            {report.invalid.map((invalid) => (
              <li key={`${label(invalid).href}-${invalid.reason}`}>
                {link(invalid)}:{" "}
                {invalid.kind === "meeting"
                  ? invalidMeetingHelp(invalid, meetings.get(invalid.meeting_id), plan)
                  : invalidItemHelp(invalid, items.get(invalid.item_id))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
