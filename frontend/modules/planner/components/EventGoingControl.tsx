import { markGoing, unmarkGoing } from "../actions";
import { getEventPlannerState } from "../queries";
import { PlannerButton } from "./PlannerButton";

/**
 * For an event's page: once the student has saved the event, lets them mark
 * it as going so it shows on their semester planner's calendar. Renders
 * nothing for an event they haven't saved.
 */
export async function EventGoingControl({ eventId }: { eventId: string }) {
  const state = await getEventPlannerState(eventId);

  if (state === null) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        Whether you&apos;re going couldn&apos;t be loaded. Please reload the page.
      </p>
    );
  }
  if (!state.saved) return null;

  return (
    <section aria-labelledby="event-going-heading" className="rounded-xl border border-gray-300 p-6 dark:border-gray-700">
      <h2 id="event-going-heading" className="text-xl font-semibold">
        Planner calendar
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {state.going
          ? "You're going: it's on your semester planner's calendar."
          : "Going? Mark it and it shows on your semester planner's calendar."}
      </p>
      <PlannerButton
        action={state.going ? unmarkGoing : markGoing}
        fields={{ eventId }}
        variant={state.going ? "secondary" : "primary"}
        className="mt-4 items-start"
      >
        {state.going ? "Not going" : "I'm going"}
      </PlannerButton>
    </section>
  );
}
