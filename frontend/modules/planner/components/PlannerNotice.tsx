/** The planner's limits, shown at the top of every planner page. */
export function PlannerNotice() {
  return (
    <aside
      aria-label="About this planner"
      className="rounded-lg border border-[var(--maroon-200)] bg-[var(--maroon-50)] px-4 py-3 text-sm text-[var(--ink)]"
    >
      <p>
        <strong>This is a tentative plan.</strong> CampusConnect has no official AUB timetable: any
        meeting times here are what you typed. Check the official schedule when you register.
        Prerequisites and degree requirements are not checked.
      </p>
    </aside>
  );
}
