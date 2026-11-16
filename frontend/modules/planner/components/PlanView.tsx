import Link from "next/link";
import { addCourse, deletePlan, moveCourse, removeCourse, switchToTypedTimes, updateSectionTimes } from "../actions";
import { itemWindow, type CalendarEntry } from "../calendar";
import type { ConflictReport } from "../conflicts";
import { invalidItemHelp, invalidMeetingHelp } from "../conflict-text";
import { creditHundredths, creditLabel, totalCreditHundredths } from "../credits";
import type { PlanSectionState, SectionPicker as SectionPickerData } from "../queries";
import { sectionCountLabel } from "../sections";
import { AUB_CALENDAR_SOURCE, formatTermDate, resisSemesterName } from "../terms";
import { timeFromMinutes, weekdayLabel } from "../time";
import type { CourseSearchResult, ImportedSemester, PlanDetails, PlannedCourse, PlannerEvent, SectionChange } from "../types";
import { CalendarWeek } from "./CalendarWeek";
import { ConflictPanel } from "./ConflictPanel";
import { EventsSection } from "./EventsSection";
import { AddItemForm, ItemRow, type ItemCourseOption } from "./ItemForms";
import { AddMeetingForm, MeetingItem, TimeZoneList } from "./MeetingForms";
import { PlannerButton } from "./PlannerButton";
import { PlannerNotice } from "./PlannerNotice";
import { importedOn, ScheduleLink } from "./ScheduleLink";
import { SectionPicker } from "./SectionPicker";

type PlanViewProps = {
  plan: PlanDetails;
  /** The conflict engine's report on the saved plan and going events. */
  report: ConflictReport;
  /** The catalogue search text from ?q=. */
  query: string;
  /** Search results; null when the search failed. */
  results: readonly CourseSearchResult[] | null;
  /** Saved events near the term; null when they couldn't be read. */
  events: readonly PlannerEvent[] | null;
  /** The week the calendar shows. */
  calendar: { monday: string; range: { first: string; last: string }; today: string; days: readonly CalendarEntry[][] };
  /** Imported semesters, section changes and offered courses (SCRUM-243). */
  sectionState?: PlanSectionState;
  /** The open section picker, from ?sections=. */
  picker?: SectionPickerData | null;
  /** The course whose sections were just saved, from ?chosen=; `only` when it was its one section, chosen on adding it. */
  chosen?: { planCourseId: string; only: boolean } | null;
};

const NO_SECTION_STATE: PlanSectionState = { semesters: [], changes: [], offered: new Map() };

/** What the lists mark on each meeting, item and event. */
type Notes = {
  conflicting: ReadonlySet<string>;
  problems: ReadonlyMap<string, string>;
};

const SECTION_HEADING = "text-lg font-semibold text-[var(--ink)]";

/** One plan: credit total, conflicts, the week calendar, courses and their meetings, own items and events. */
export function PlanView({
  plan,
  report,
  query,
  results,
  events,
  calendar,
  sectionState = NO_SECTION_STATE,
  picker = null,
  chosen = null,
}: PlanViewProps) {
  const total = totalCreditHundredths(plan.courses);
  const count = plan.courses.length;
  const meetings = new Map(plan.courses.flatMap((planned) => planned.meetings.map((meeting) => [meeting.id, meeting] as const)));
  const items = new Map(plan.items.map((item) => [item.id, item]));
  const notes: Notes = {
    conflicting: new Set(
      report.conflicts.flatMap((conflict) =>
        conflict.sides.map((side) => (side.kind === "meeting" ? side.meeting_id : side.kind === "item" ? side.item_id : side.event_id)),
      ),
    ),
    problems: new Map(
      report.invalid.map((invalid) =>
        invalid.kind === "meeting"
          ? [invalid.meeting_id, invalidMeetingHelp(invalid, meetings.get(invalid.meeting_id), plan)]
          : [invalid.item_id, invalidItemHelp(invalid, items.get(invalid.item_id))],
      ),
    ),
  };
  const courseOptions: ItemCourseOption[] = plan.courses.map((planned) => ({ planCourseId: planned.plan_course_id, code: planned.code }));
  const dateRange = itemWindow(plan);

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
        <PlannerNotice />
        <ScheduleLink
          planId={plan.id}
          semester={plan.semester ?? null}
          semesters={sectionState.semesters}
          suggestedName={resisSemesterName(plan.term)}
        />
        <p
          aria-live="polite"
          className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-base text-[var(--ink)]"
        >
          Total: <strong>{creditLabel(total)}</strong> · {count} {count === 1 ? "course" : "courses"}
        </p>
      </header>

      <ConflictPanel plan={plan} events={events ?? []} report={report} />

      <CalendarWeek plan={plan} {...calendar} />

      <CourseSearch plan={plan} query={query} results={results} />

      <TimeZoneList />

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
                notes={notes}
                semester={plan.semester ?? null}
                offered={sectionState.offered.get(planned.course_id) ?? null}
                changes={sectionState.changes.filter((change) => change.plan_course_id === planned.plan_course_id)}
                picker={picker?.planned.plan_course_id === planned.plan_course_id ? picker : null}
                justChosen={chosen?.planCourseId === planned.plan_course_id ? (chosen.only ? "only" : "picked") : null}
              />
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="plan-items-heading" className="flex flex-col gap-3">
        <h2 id="plan-items-heading" className={SECTION_HEADING}>
          Exams and other items
        </h2>
        {plan.items.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Add exams, deadlines or anything else you want on the calendar.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plan.items.map((item) => (
              <ItemRow
                key={item.id}
                planId={plan.id}
                item={item}
                courses={courseOptions}
                dateRange={dateRange}
                conflict={notes.conflicting.has(item.id)}
                problem={notes.problems.get(item.id)}
              />
            ))}
          </ul>
        )}
        <AddItemForm planId={plan.id} courses={courseOptions} dateRange={dateRange} />
      </section>

      <EventsSection events={events} conflicting={notes.conflicting} />

      <section aria-labelledby="delete-plan-heading" className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
        <h2 id="delete-plan-heading" className="text-sm font-semibold text-[var(--ink)]">
          Delete this plan
        </h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Removes the plan, its courses, meeting times and items. Your saved events stay saved. This can&apos;t be undone.
        </p>
        <PlannerButton action={deletePlan} fields={{ planId: plan.id }} variant="danger" className="self-start">
          Delete {plan.term} plan
        </PlannerButton>
      </section>
    </div>
  );
}

function CourseSearch({ plan, query, results }: Pick<PlanViewProps, "plan" | "query" | "results">) {
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
                  {creditLabel(creditHundredths(course.credits))}
                  {plan.semester && course.section_count !== undefined ? (
                    course.section_count === null ? (
                      <> · Not in the imported {plan.semester.name} schedule; you can still add it and type its times</>
                    ) : (
                      <> · {sectionCountLabel(course.section_count)} in {plan.semester.name}</>
                    )
                  ) : null}
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
  notes,
  semester,
  offered,
  changes,
  picker,
  justChosen,
}: {
  planId: string;
  planned: PlannedCourse;
  first: boolean;
  last: boolean;
  notes: Notes;
  /** The imported semester the plan is linked to, or null. */
  semester: ImportedSemester | null;
  /** Its sections in the linked semester, or null when not offered. */
  offered: number | null;
  /** Its chosen sections that a newer snapshot changed or dropped. */
  changes: readonly SectionChange[];
  picker: SectionPickerData | null;
  /** Its sections were just saved: picked in the picker, or its only section chosen on adding it. */
  justChosen: "picked" | "only" | null;
}) {
  const headingId = `planned-${planned.plan_course_id}`;
  const fields = { planId, planCourseId: planned.plan_course_id };
  const sections = planned.sections ?? [];
  const pickerHref = `/planner/${planId}?sections=${planned.plan_course_id}#course-${planned.plan_course_id}`;

  return (
    <li>
      <article
        id={`course-${planned.plan_course_id}`}
        aria-labelledby={headingId}
        className="flex scroll-mt-24 flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={headingId} className="text-base font-semibold text-[var(--ink)]">
              {planned.code} <span className="font-normal">{planned.name}</span>
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">{creditLabel(creditHundredths(planned.credits))}</p>
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

        {justChosen && sections.length > 0 ? (
          <p role="status" className="text-sm text-[var(--success)]">
            {justChosen === "only" && sections.length === 1
              ? `Added. It has one section in AUB's schedule, so it was chosen: Section ${sections[0].section} (CRN ${sections[0].crn}).`
              : "Section times added from AUB's schedule."}
          </p>
        ) : null}

        {sections.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-[var(--ink)]">
              Sections <span className="font-normal text-[var(--ink-soft)]">· From AUB&apos;s schedule (Resis)</span>
            </h4>
            {changes.map((change) => (
              <SectionChangeNotice key={change.crn} planId={planId} planned={planned} change={change} pickerHref={pickerHref} />
            ))}
            <ul className="flex flex-col gap-2">
              {sections.map((section) => {
                const meetings = planned.meetings.filter((meeting) => meeting.crn === section.crn);
                return (
                  <li key={section.crn} className="rounded-md bg-[var(--maroon-50)] px-3 py-2">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      Section {section.section} · CRN {section.crn}
                    </p>
                    {meetings.length === 0 ? (
                      <p className="text-xs text-[var(--ink-soft)]">Times to be announced: AUB&apos;s schedule doesn&apos;t list them yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {meetings.map((meeting) => {
                          const conflict = notes.conflicting.has(meeting.id);
                          const problem = notes.problems.get(meeting.id);
                          return (
                            <li
                              key={meeting.id}
                              id={`meeting-${meeting.id}`}
                              className={`flex scroll-mt-24 flex-wrap items-center gap-x-3 text-sm text-[var(--ink)] ${conflict || problem ? "border-l-4 border-[var(--danger)] pl-2" : ""}`}
                            >
                              {weekdayLabel(meeting.weekday)} {timeFromMinutes(meeting.start_minute)}–{timeFromMinutes(meeting.end_minute)}
                              {conflict ? (
                                <span className="rounded-full border border-[var(--danger)] bg-white px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">
                                  <span aria-hidden="true">⚠ </span>Overlaps something else
                                </span>
                              ) : null}
                              {problem ? <span className="w-full text-xs text-[var(--danger)]">{problem}</span> : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-start gap-2">
              {semester && !picker ? (
                <Link
                  href={pickerHref}
                  aria-label={`Change section of ${planned.code}`}
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--maroon)]"
                >
                  Change section
                </Link>
              ) : null}
              <PlannerButton action={switchToTypedTimes} fields={fields} label={`Use typed times for ${planned.code} instead of its sections`}>
                Use typed times instead
              </PlannerButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-[var(--ink)]">
              Meeting times
              {planned.meetings.length > 0 ? <span className="font-normal text-[var(--ink-soft)]"> · Tentative, entered by you</span> : null}
            </h4>
            {planned.meetings.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">No times yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {planned.meetings.map((meeting) => (
                  <MeetingItem
                    key={meeting.id}
                    planId={planId}
                    meeting={meeting}
                    conflict={notes.conflicting.has(meeting.id)}
                    problem={notes.problems.get(meeting.id)}
                  />
                ))}
              </ul>
            )}
            {semester && offered !== null && !picker ? (
              <p className="text-sm text-[var(--ink)]">
                <Link href={pickerHref} className="font-medium text-[var(--maroon)] underline">
                  Choose a section of {planned.code}
                </Link>{" "}
                <span className="text-[var(--ink-soft)]">
                  ({sectionCountLabel(offered)} in AUB&apos;s {semester.name} schedule) to fill in its times.
                </span>
              </p>
            ) : null}
            <AddMeetingForm planId={planId} planCourseId={planned.plan_course_id} courseCode={planned.code} />
          </div>
        )}

        {picker ? (
          <SectionPicker
            planId={planId}
            planned={picker.planned}
            semester={picker.semester}
            options={picker.options}
            chosen={picker.chosen}
            typedMeetings={picker.typedMeetings}
          />
        ) : null}
      </article>
    </li>
  );
}

/** What changed for a chosen section in AUB's newer schedule, and how to deal with it. */
function SectionChangeNotice({
  planId,
  planned,
  change,
  pickerHref,
}: {
  planId: string;
  planned: PlannedCourse;
  change: SectionChange;
  pickerHref: string;
}) {
  const fields = { planId, planCourseId: planned.plan_course_id };
  const crns = (planned.sections ?? []).map((section) => section.crn).join(",");

  return (
    <div role="note" className="flex flex-col gap-2 rounded-md border border-[var(--danger)] bg-white px-3 py-2">
      {change.status === "changed" ? (
        <>
          <p className="text-sm text-[var(--ink)]">
            AUB&apos;s schedule for {planned.code} section {change.section} changed (imported {importedOn(change.imported_at)}).
          </p>
          <PlannerButton
            action={updateSectionTimes}
            fields={{ ...fields, crns }}
            label={`Update times of ${planned.code} from AUB's schedule`}
            variant="primary"
            className="self-start"
          >
            Update times
          </PlannerButton>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--ink)]">
            Section {change.section} (CRN {change.crn}) is no longer in the imported schedule.
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <Link
              href={pickerHref}
              aria-label={`Choose another section of ${planned.code}`}
              className="rounded-md border border-[var(--maroon)] bg-[var(--maroon)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--maroon-dark)]"
            >
              Choose another section
            </Link>
            <PlannerButton action={switchToTypedTimes} fields={fields} label={`Use typed times for ${planned.code}`}>
              Use typed times
            </PlannerButton>
          </div>
        </>
      )}
    </div>
  );
}
