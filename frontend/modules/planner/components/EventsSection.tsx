import Link from "next/link";
import { markGoing, unmarkGoing } from "../actions";
import { formatEventWhen } from "../calendar";
import type { PlannerEvent } from "../types";
import { PlannerButton } from "./PlannerButton";

type EventsSectionProps = {
  /** Saved events near the term; null when they couldn't be read. */
  events: readonly PlannerEvent[] | null;
  /** Ids of going events that overlap something. */
  conflicting: ReadonlySet<string>;
};

/**
 * The student's saved events near the plan's term. Those marked as going
 * are on the calendar and in the conflict check; the rest wait here.
 */
export function EventsSection({ events, conflicting }: EventsSectionProps) {
  const going = events?.filter((event) => event.going) ?? [];
  const saved = events?.filter((event) => !event.going) ?? [];

  return (
    <section aria-labelledby="planner-events-heading" className="flex flex-col gap-3">
      <h2 id="planner-events-heading" className="text-lg font-semibold text-[var(--ink)]">
        Events
      </h2>

      {events === null ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          Your saved events couldn&apos;t be loaded, so they aren&apos;t on the calendar. Reload the page to try again.
        </p>
      ) : events.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">
          No saved events around this term.{" "}
          <Link href="/events" className="font-medium text-[var(--maroon)] underline">
            Browse events
          </Link>
          , save the ones you like, then mark the ones you&apos;re going to.
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--ink-soft)]">Events you&apos;re going to are on the calendar.</p>
          {going.length ? <EventList title="Going" events={going} conflicting={conflicting} /> : null}
          {saved.length ? <EventList title="Saved" events={saved} conflicting={conflicting} /> : null}
        </>
      )}
    </section>
  );
}

function EventList({ title, events, conflicting }: { title: string; events: readonly PlannerEvent[]; conflicting: ReadonlySet<string> }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
      <ul className="flex flex-col gap-2">
        {events.map((event) => {
          const conflict = conflicting.has(event.id);
          return (
            <li
              key={event.id}
              id={`event-${event.id}`}
              className={`flex scroll-mt-24 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 ${
                conflict ? "border-l-4 border-[var(--danger)] bg-[#fdecea]" : event.going ? "bg-[#e7f2f7]" : "border border-[var(--border)] bg-white"
              }`}
            >
              <div className="min-w-0 text-sm text-[var(--ink)]">
                <Link href={`/events/${event.id}`} className="font-medium text-[var(--maroon)] underline">
                  {event.title}
                </Link>
                <p className="text-[var(--ink-soft)]">
                  {formatEventWhen(event)} · {event.location}
                </p>
              </div>
              {conflict ? (
                <span className="rounded-full border border-[var(--danger)] bg-white px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">
                  <span aria-hidden="true">⚠ </span>Overlaps something else
                </span>
              ) : null}
              <div className="ml-auto">
                {event.going ? (
                  <PlannerButton action={unmarkGoing} fields={{ eventId: event.id }} label={`Not going to ${event.title}`}>
                    Not going
                  </PlannerButton>
                ) : (
                  <PlannerButton action={markGoing} fields={{ eventId: event.id }} label={`Going to ${event.title}`} variant="primary">
                    I&apos;m going
                  </PlannerButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
