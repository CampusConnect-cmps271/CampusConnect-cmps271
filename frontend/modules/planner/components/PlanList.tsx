import Link from "next/link";
import { formatTermDate } from "../terms";
import type { PlanSummary } from "../types";

/** "My plans": one link per term. */
export function PlanList({ plans }: { plans: readonly PlanSummary[] }) {
  if (plans.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-soft)]">
        You have no plans yet. Choose a term above to start one.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {plans.map((plan) => (
        <li key={plan.id}>
          <Link
            href={`/planner/${plan.id}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] bg-white px-4 py-3 hover:border-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
          >
            <span className="font-semibold text-[var(--ink)]">{plan.term}</span>
            <span className="text-sm text-[var(--ink-soft)]">
              {formatTermDate(plan.starts_on)} – {formatTermDate(plan.ends_on)} ·{" "}
              {plan.course_count} {plan.course_count === 1 ? "course" : "courses"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
