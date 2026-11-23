import { ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { addCourse, deletePlan, moveCourse, removeCourse, updateSectionTimes } from "../actions";
import { itemWindow, type CalendarEntry } from "../calendar";
import type { ConflictReport } from "../conflicts";
import { invalidMeetingHelp } from "../conflict-text";
import { creditHundredths, creditLabel, totalCreditHundredths } from "../credits";
import type { PlanSectionState, SectionPicker as SectionPickerData } from "../queries";
import { importedOn, sectionCountLabel, sectionNoticeText, type SectionNotice } from "../sections";
import { AUB_CALENDAR_SOURCE, formatTermDate, resisSemesterName } from "../terms";
import { timeFromMinutes, weekdayLabel } from "../time";
import type { CourseSearchResult, ImportedSemester, Meeting, PlanDetails, PlannedCourse, PlannerEvent, SectionChange } from "../types";
import { CalendarWeek } from "./CalendarWeek";
import { ConflictPanel } from "./ConflictPanel";
import { EventsSection } from "./EventsSection";
import { PlannerButton } from "./PlannerButton";
import { ScheduleLink } from "./ScheduleLink";
import { SectionPicker } from "./SectionPicker";
import { PANEL, PANEL_HEADING } from "./styles";

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
  /** What was just done to a course's sections, from ?done=<plan course>&what=. */
  done?: { planCourseId: string; what: SectionNotice } | null;
};

const NO_SECTION_STATE: PlanSectionState = { semesters: [], changes: [], offered: new Map() };

/** What the course cards mark on each meeting. */
type Notes = {
  conflicting: ReadonlySet<string>;
  problems: ReadonlyMap<string, string>;
};

/**
 * One plan on one screen: the plan's courses and events in a sidebar, and
 * its calendar beside them. Items are added by clicking the calendar.
 */
export function PlanView({
  plan,
  report,
  query,
  results,
  events,
  calendar,
  sectionState = NO_SECTION_STATE,
  picker = null,
  done = null,
}: PlanViewProps) {
  const total = totalCreditHundredths(plan.courses);
  const count = plan.courses.length;
  const meetings = new Map(plan.courses.flatMap((planned) => planned.meetings.map((meeting) => [meeting.id, meeting] as const)));
  const notes: Notes = {
    conflicting: new Set(
      report.conflicts.flatMap((conflict) =>
        conflict.sides.map((side) => (side.kind === "meeting" ? side.meeting_id : side.kind === "item" ? side.item_id : side.event_id)),
      ),
    ),
    problems: new Map(
      report.invalid.flatMap((invalid) =>
        invalid.kind === "meeting" ? [[invalid.meeting_id, invalidMeetingHelp(invalid, meetings.get(invalid.meeting_id), plan)] as const] : [],
      ),
    ),
  };
  const courseOptions = plan.courses.map((planned) => ({ planCourseId: planned.plan_course_id, code: planned.code }));

  return (
    <div className="mx-auto grid w-full max-w-[96rem] gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-start">
      <aside aria-label="Courses and events" className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-col gap-1">
          <Link href="/planner" className="self-start text-sm font-medium text-[var(--maroon)] hover:underline">
            ← All plans
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ink)]">{plan.term} plan</h1>
          <p aria-live="polite" className="text-sm text-[var(--ink)]">
            <strong>{creditLabel(total)}</strong> · {count} {count === 1 ? "course" : "courses"}
          </p>
          <p className="text-xs text-[var(--ink-soft)]">
            Classes{" "}
            <a href={AUB_CALENDAR_SOURCE} className="underline" target="_blank" rel="noreferrer">
              {formatTermDate(plan.starts_on)} – {formatTermDate(plan.ends_on)}
            </a>
          </p>
        </header>

        <ScheduleLink
          planId={plan.id}
          semester={plan.semester ?? null}
          semesters={sectionState.semesters}
          suggestedName={resisSemesterName(plan.term)}
        />

        <section aria-labelledby="courses-heading" className={PANEL}>
          <h2 id="courses-heading" className={PANEL_HEADING}>
            Courses
          </h2>
          <CourseSearch plan={plan} query={query} results={results} />
          {count === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">No courses yet.</p>
          ) : (
            <ol aria-label="Courses in this plan" className="flex flex-col gap-2">
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
                  done={done?.planCourseId === planned.plan_course_id ? done.what : null}
                />
              ))}
            </ol>
          )}
        </section>

        <EventsSection events={events} conflicting={notes.conflicting} />

        <details className="px-1 text-sm">
          <summary className="cursor-pointer text-[var(--ink-soft)] hover:text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]">
            Delete this plan
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[var(--ink-soft)]">Its courses and items go too; saved events stay. This can&apos;t be undone.</p>
            <PlannerButton action={deletePlan} fields={{ planId: plan.id }} variant="danger" className="self-start">
              Delete {plan.term} plan
            </PlannerButton>
          </div>
        </details>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <ConflictPanel plan={plan} events={events ?? []} report={report} />
        <CalendarWeek plan={plan} {...calendar} courses={courseOptions} dateRange={itemWindow(plan)} />
      </div>
    </div>
  );
}

function CourseSearch({ plan, query, results }: Pick<PlanViewProps, "plan" | "query" | "results">) {
  const planned = new Set(plan.course_ids);

  return (
    <div className="flex flex-col gap-2">
      <form role="search" action={`/planner/${plan.id}`} method="get" className="flex gap-2">
        <label htmlFor="planner-search" className="sr-only">
          Search the catalogue
        </label>
        <input
          id="planner-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Add a course, e.g. CMPS 240"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:border-[var(--maroon)] focus:outline-none focus:ring-2 focus:ring-[var(--maroon-200)]"
        />
        <button
          type="submit"
          aria-label="Search"
          className="inline-flex items-center justify-center rounded-md bg-[var(--maroon)] px-3 text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>

      {query && results === null ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          Course search is unavailable right now. Please try again in a moment.
        </p>
      ) : null}

      {query && results?.length === 0 ? <p className="text-sm text-[var(--ink-soft)]">No courses match &ldquo;{query}&rdquo;.</p> : null}

      {query && results && results.length > 0 ? (
        <ul aria-label={`Courses matching ${query}`} className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {results.map((course) => (
            <li key={course.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
              <div className="min-w-0">
                <p title={`${course.code} ${course.name}`} className="truncate text-sm font-semibold text-[var(--ink)]">
                  {course.code} <span className="font-normal">{course.name}</span>
                </p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {creditLabel(creditHundredths(course.credits))}
                  {plan.semester && course.section_count !== undefined
                    ? course.section_count === null
                      ? ` · Not in ${plan.semester.name}`
                      : ` · ${sectionCountLabel(course.section_count)}`
                    : null}
                </p>
              </div>
              {planned.has(course.id) ? (
                <span className="shrink-0 rounded-full bg-[var(--maroon-50)] px-2 py-1 text-xs font-medium text-[var(--maroon)]">In this plan</span>
              ) : (
                <PlannerButton
                  action={addCourse}
                  fields={{ planId: plan.id, courseId: course.id }}
                  label={`Add ${course.code} to this plan`}
                  variant="primary"
                  className="shrink-0"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                </PlannerButton>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {query ? (
        <Link href={`/planner/${plan.id}`} className="self-start text-xs font-medium text-[var(--maroon)] hover:underline">
          Clear search
        </Link>
      ) : null}
    </div>
  );
}

/** One meeting line, marked when it overlaps or needs fixing. Its id is what the conflict list links to. */
function MeetingLine({ meeting, notes }: { meeting: Meeting; notes: Notes }) {
  const conflict = notes.conflicting.has(meeting.id);
  const problem = notes.problems.get(meeting.id);
  return (
    <li id={`meeting-${meeting.id}`} className={`scroll-mt-24 ${conflict || problem ? "font-semibold text-[var(--danger)]" : ""}`}>
      {weekdayLabel(meeting.weekday)} {timeFromMinutes(meeting.start_minute)}–{timeFromMinutes(meeting.end_minute)}
      {conflict ? <span> · overlaps</span> : null}
      {problem ? <span className="block font-normal">{problem}</span> : null}
    </li>
  );
}

const SMALL_LINK =
  "rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--ink)] hover:border-[var(--maroon)] hover:text-[var(--maroon)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";

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
  done,
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
  /** What was just done to its sections, if anything. */
  done: SectionNotice | null;
}) {
  const headingId = `planned-${planned.plan_course_id}`;
  const fields = { planId, planCourseId: planned.plan_course_id };
  const sections = planned.sections ?? [];
  const pickerHref = `/planner/${planId}?sections=${planned.plan_course_id}#course-${planned.plan_course_id}`;
  // Times typed before sections replaced typing: still shown and checked.
  const typed = planned.meetings.filter((meeting) => meeting.source !== "resis");

  return (
    <li>
      <article
        id={`course-${planned.plan_course_id}`}
        aria-labelledby={headingId}
        className="flex scroll-mt-24 flex-col gap-2 rounded-lg border border-[var(--border)] border-l-[3px] border-l-[var(--maroon)] p-2.5"
      >
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="text-sm font-semibold text-[var(--ink)]">
              {planned.code} <span className="font-normal">{planned.name}</span>
            </h3>
            <p className="text-xs text-[var(--ink-soft)]">{creditLabel(creditHundredths(planned.credits))}</p>
          </div>
          <div className="flex shrink-0 items-start">
            {first ? null : (
              <PlannerButton action={moveCourse} fields={{ ...fields, direction: "up" }} label={`Move ${planned.code} up`} variant="icon">
                <ChevronUp aria-hidden="true" className="h-4 w-4" />
              </PlannerButton>
            )}
            {last ? null : (
              <PlannerButton action={moveCourse} fields={{ ...fields, direction: "down" }} label={`Move ${planned.code} down`} variant="icon">
                <ChevronDown aria-hidden="true" className="h-4 w-4" />
              </PlannerButton>
            )}
            <PlannerButton action={removeCourse} fields={fields} label={`Remove ${planned.code} from this plan`} variant="icon">
              <X aria-hidden="true" className="h-4 w-4" />
            </PlannerButton>
          </div>
        </div>

        {done && sections.length > 0 ? (
          <p role="status" className="text-xs text-[var(--success)]">
            {sectionNoticeText(done, sections)}
          </p>
        ) : null}

        {changes.map((change) => (
          <SectionChangeNotice key={change.crn} planId={planId} planned={planned} change={change} pickerHref={pickerHref} />
        ))}

        {sections.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {sections.map((section) => {
              const meetings = planned.meetings.filter((meeting) => meeting.crn === section.crn);
              return (
                <li key={section.crn} className="rounded-md bg-[var(--maroon-50)] px-2.5 py-1.5 text-xs text-[var(--ink)]">
                  <p className="font-medium">
                    Section {section.section} · CRN {section.crn}
                  </p>
                  {meetings.length === 0 ? (
                    <p className="text-[var(--ink-soft)]">Times to be announced</p>
                  ) : (
                    <ul>
                      {meetings.map((meeting) => (
                        <MeetingLine key={meeting.id} meeting={meeting} notes={notes} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {typed.length > 0 && sections.length === 0 ? (
          <ul className="rounded-md bg-[var(--maroon-50)] px-2.5 py-1.5 text-xs text-[var(--ink)]">
            {typed.map((meeting) => (
              <MeetingLine key={meeting.id} meeting={meeting} notes={notes} />
            ))}
          </ul>
        ) : null}

        {picker ? null : sections.length > 0 ? (
          semester ? (
            <Link href={pickerHref} aria-label={`Change section of ${planned.code}`} className={`self-start ${SMALL_LINK}`}>
              Change section
            </Link>
          ) : null
        ) : semester && offered !== null ? (
          <Link
            href={pickerHref}
            aria-label={`Choose a section of ${planned.code}`}
            className="self-start rounded-md bg-[var(--maroon)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]"
          >
            Choose a section ({sectionCountLabel(offered)})
          </Link>
        ) : typed.length === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">{semester ? `Not in AUB's ${semester.name} schedule` : "No times yet"}</p>
        ) : null}

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
  const crns = (planned.sections ?? []).map((section) => section.crn).join(",");

  return (
    <div role="note" className="flex flex-col gap-2 rounded-md border border-[var(--danger)] bg-white px-2.5 py-2 text-xs text-[var(--ink)]">
      {change.status === "changed" ? (
        <>
          <p>
            Section {change.section}&apos;s times changed in AUB&apos;s schedule (imported {importedOn(change.imported_at)}).
          </p>
          <PlannerButton
            action={updateSectionTimes}
            fields={{ planId, planCourseId: planned.plan_course_id, crns }}
            label={`Update times of ${planned.code} from AUB's schedule`}
            variant="primary"
            className="self-start"
          >
            Update times
          </PlannerButton>
        </>
      ) : (
        <>
          <p>Section {change.section} (CRN {change.crn}) is no longer in AUB&apos;s schedule.</p>
          <Link
            href={pickerHref}
            aria-label={`Choose another section of ${planned.code}`}
            className="self-start rounded-md bg-[var(--maroon)] px-2.5 py-1 font-semibold text-white hover:bg-[var(--maroon-dark)]"
          >
            Choose another section
          </Link>
        </>
      )}
    </div>
  );
}
