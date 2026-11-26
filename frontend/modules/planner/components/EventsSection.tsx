import Link from "next/link";
import { markGoing, unmarkGoing } from "../actions";
import { formatEventWhen } from "../calendar";
import type { PlannerEvent } from "../types";
import { PlannerButton } from "./PlannerButton";
import { PANEL, PANEL_HEADING } from "./styles";

type EventsSectionProps = {
  /** Saved events near the term; null when they couldn't be read. */
  events: readonly PlannerEvent[] | null;
  /** Ids of going events that overlap something. */
  conflicting: ReadonlySet<string>;
};

/**
 * The student's saved events near the plan's term. Those marked as going
 * are on the calendar and in the conflict check.
 */
export function EventsSection({ events, conflicting }: EventsSectionProps) {
  return (
    <section aria-labelledby="planner-events-heading" className={PANEL}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="planner-events-heading" className={PANEL_HEADING}>
          Events
        </h2>
        <Link href="/events" className="text-xs font-medium text-[var(--maroon)] hover:underline">
          Find events
        </Link>
      </div>

      {events === null ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          Your saved events couldn&apos;t be loaded. Reload the page to try again.
        </p>
      ) : events.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">No saved events around this term.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {events.map((event) => {
            const conflict = conflicting.has(event.id);
            return (
              <li
                key={event.id}
                id={`event-${event.id}`}
                className={`flex scroll-mt-24 items-center gap-2 rounded-lg border-l-[3px] px-2.5 py-2 ${
                  conflict
                    ? "border-[var(--danger)] bg-[#fdecea]"
                    : event.going
                      ? "border-[#2f6f8f] bg-[#e1f0f7]"
                      : "border-[var(--border)] bg-[var(--maroon-50)]"
                }`}
              >
                <div className="min-w-0 flex-1 text-xs text-[var(--ink)]">
                  <Link href={`/events/${event.id}`} className="text-sm font-semibold text-[var(--ink)] hover:text-[var(--maroon)] hover:underline">
                    {event.title}
                  </Link>
                  <p className="text-[var(--ink-soft)]">
                    {formatEventWhen(event)} · {event.location}
                  </p>
                  {conflict ? <p className="font-semibold text-[var(--danger)]">Overlaps something else</p> : null}
                </div>
                {event.going ? (
                  <PlannerButton action={unmarkGoing} fields={{ eventId: event.id }} label={`Not going to ${event.title}`} className="shrink-0">
                    Not going
                  </PlannerButton>
                ) : (
                  <PlannerButton action={markGoing} fields={{ eventId: event.id }} label={`Going to ${event.title}`} variant="primary" className="shrink-0">
                    I&apos;m going
                  </PlannerButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
