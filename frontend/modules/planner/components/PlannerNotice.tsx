/** The planner's one caveat, shown on every planner page. */
export function PlannerNotice() {
  return (
    <p className="text-sm text-[var(--ink-soft)]">
      Times you type are tentative. A chosen section&apos;s times come from AUB&apos;s schedule as imported via Resis; check AUB SIS
      before you register.
    </p>
  );
}
