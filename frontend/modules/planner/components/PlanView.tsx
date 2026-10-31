import Link from "next/link";
import { addCourse, deletePlan, moveCourse, removeCourse } from "../actions";
import { creditHundredths, creditLabel, totalCreditHundredths } from "../credits";
import { AUB_CALENDAR_SOURCE, formatTermDate } from "../terms";
import type { CourseSearchResult, PlanDetails, PlannedCourse } from "../types";
import { AddMeetingForm, MeetingItem } from "./MeetingForms";
import { PlannerButton } from "./PlannerButton";
import { PlannerNotice } from "./PlannerNotice";

type PlanViewProps = {
  plan: PlanDetails;
  /** The catalogue search text from ?q=. */
  query: string;
  /** Search results; null when the search failed. */
  results: readonly CourseSearchResult[] | null;
};

const SECTION_HEADING = "text-lg font-semibold text-[var(--ink)]";

/** One plan: credit total, course search, the ordered courses and their meetings. */
export function PlanView({ plan, query, results }: PlanViewProps) {
  const total = totalCreditHundredths(plan.courses);
  const count = plan.courses.length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/planner" className="text-sm font-medium text-[var(--maroon)] hover:underline">
        ← My plans
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-[var(--ink)]">{plan.term} plan</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Classes run {formatTermDate(plan.starts_on)} to {formatTermDate(plan.ends_on)} (
          <a href={AUB_CALENDAR_SOURCE} className="underline" target="_blank" rel="noreferrer">
            official AUB academic calendar
          </a>
          ).
        </p>
        <p
          aria-live="polite"
          className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-base text-[var(--ink)]"
        >
          Total: <strong>{creditLabel(total)}</strong> · {count} {count === 1 ? "course" : "courses"}
        </p>
      </header>

      <PlannerNotice />

      <CourseSearch plan={plan} query={query} results={results} />

      <section aria-labelledby="planned-courses-heading" className="flex flex-col gap-3">
        <h2 id="planned-courses-heading" className={SECTION_HEADING}>
          Courses in this plan
        </h2>
        {count === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            No courses yet. Search the catalogue above and add the ones you&apos;re considering.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {plan.courses.map((planned, index) => (
              <PlannedCourseCard
                key={planned.plan_course_id}
                planId={plan.id}
                planned={planned}
                first={index === 0}
                last={index === count - 1}
              />
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="delete-plan-heading" className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
        <h2 id="delete-plan-heading" className="text-sm font-semibold text-[var(--ink)]">
          Delete this plan
        </h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Removes the plan, its courses and the meeting times you typed. This can&apos;t be undone.
        </p>
        <PlannerButton action={deletePlan} fields={{ planId: plan.id }} variant="danger" className="self-start">
          Delete {plan.term} plan
        </PlannerButton>
      </section>
    </div>
  );
}

function CourseSearch({ plan, query, results }: PlanViewProps) {
  const planned = new Set(plan.course_ids);

  return (
    <section aria-labelledby="course-search-heading" className="flex flex-col gap-3">
      <h2 id="course-search-heading" className={SECTION_HEADING}>
        Add courses
      </h2>
      <form role="search" action={`/planner/${plan.id}`} method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="planner-search" className="text-sm font-semibold text-[var(--ink)]">
            Search the catalogue
          </label>
          <input
            id="planner-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Course code or name, e.g. CMPS 240"
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--maroon)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
        >
          Search
        </button>
      </form>

      {query && results === null ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          Course search is unavailable right now. Please try again in a moment.
        </p>
      ) : null}

      {query && results?.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">No catalogue courses match &ldquo;{query}&rdquo;.</p>
      ) : null}

      {query && results && results.length > 0 ? (
        <ul aria-label={`Courses matching ${query}`} className="flex flex-col gap-2">
          {results.map((course) => (
            <li
              key={course.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {course.code} <span className="font-normal">{course.name}</span>
                </p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {creditLabel(creditHundredths(course.credits))} · {course.department}
                </p>
              </div>
              {planned.has(course.id) ? (
                <span className="rounded-full bg-[var(--maroon-50)] px-2 py-1 text-xs font-medium text-[var(--maroon)]">
                  In this plan
                </span>
              ) : (
                <PlannerButton
                  action={addCourse}
                  fields={{ planId: plan.id, courseId: course.id }}
                  label={`Add ${course.code} to this plan`}
                  variant="primary"
                >
                  Add
                </PlannerButton>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PlannedCourseCard({
  planId,
  planned,
  first,
  last,
}: {
  planId: string;
  planned: PlannedCourse;
  first: boolean;
  last: boolean;
}) {
  const headingId = `planned-${planned.plan_course_id}`;
  const fields = { planId, planCourseId: planned.plan_course_id };

  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={headingId} className="text-base font-semibold text-[var(--ink)]">
              {planned.code} <span className="font-normal">{planned.name}</span>
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              {creditLabel(creditHundredths(planned.credits))} · {planned.department}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {first ? null : (
              <PlannerButton action={moveCourse} fields={{ ...fields, direction: "up" }} label={`Move ${planned.code} up`}>
                Move up
              </PlannerButton>
            )}
            {last ? null : (
              <PlannerButton action={moveCourse} fields={{ ...fields, direction: "down" }} label={`Move ${planned.code} down`}>
                Move down
              </PlannerButton>
            )}
            <PlannerButton
              action={removeCourse}
              fields={fields}
              label={`Remove ${planned.code} from this plan`}
              variant="danger"
            >
              Remove
            </PlannerButton>
          </div>
        </div>

        {planned.prerequisites ? (
          <div className="text-sm text-[var(--ink)]">
            <p className="font-medium">
              Prerequisites{" "}
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-normal text-[var(--ink-soft)]">
                Not checked by CampusConnect
              </span>
            </p>
            <p className="mt-1 whitespace-pre-line text-[var(--ink-soft)]">{planned.prerequisites}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-[var(--ink)]">Meeting times</h4>
          {planned.meetings.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">
              <strong className="text-[var(--ink)]">Schedule unknown.</strong> You haven&apos;t entered
              times for this course, so CampusConnect can&apos;t tell whether it clashes with others.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {planned.meetings.map((meeting) => (
                <MeetingItem key={meeting.id} planId={planId} meeting={meeting} />
              ))}
            </ul>
          )}
          <AddMeetingForm planId={planId} planCourseId={planned.plan_course_id} courseCode={planned.code} />
        </div>
      </article>
    </li>
  );
}
