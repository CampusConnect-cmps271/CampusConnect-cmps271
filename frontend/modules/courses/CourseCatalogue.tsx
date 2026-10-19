import Link from "next/link";
import { CatalogueUnavailable, getCourseCatalogue, type Course } from "./catalogue";
import { COURSES_PER_PAGE, COURSE_RANGE_FILTERS, coursesUrl, type CourseFilters } from "./search";
import styles from "./courses.module.css";
import { courseUrl } from "./references";
import { getCourseRatings } from "@/modules/ratings/queries";
import { RatingSummary } from "@/modules/ratings/RatingSummary";
import { CourseFilterForm, ClearCourseFilters } from "./CourseFilterForm";
import { ComparisonSelection, ComparisonToggle } from "./ComparisonSelection";

export async function CourseCatalogue({ filters }: { filters: CourseFilters }) {
  // Authentication redirects must escape this catch, rather than becoming
  // a misleading database error (the page calls requireUser before rendering).
  const result = await getCourseCatalogue(filters).then(
    (data) => ({ data, failed: false as const }),
    (error: unknown) => {
      if (error instanceof CatalogueUnavailable) {
        return { data: null, failed: true as const };
      }
      throw error;
    },
  );
  if (result.failed) return (
    <section className={styles.notice} role="alert" aria-labelledby="courses-error-title">
      <h2 id="courses-error-title">Courses couldn’t be loaded</h2>
      <p>The catalogue is temporarily unavailable. Please try again.</p>
      <a href={coursesUrl(filters)}>Try again</a>
    </section>
  );
  const { courses, departments, total, page, pages, filterError } = result.data;
  const ratings = await getCourseRatings(courses.map((course) => course.id));
  const groups = new Map<string, Course[]>();
  for (const course of courses) {
    const group = groups.get(course.department) ?? [];
    group.push(course);
    groups.set(course.department, group);
  }

  return <>
    <ComparisonSelection filters={{ ...filters, page }} />
    <CourseFilterForm key={coursesUrl(filters)}>
      {filters.compare?.map((code) => <input key={code} type="hidden" name="compare" value={code} />)}
      <div className={styles.searchField}>
        <label htmlFor="course-search">Course name or code</label>
        <input id="course-search" name="q" type="search" maxLength={120}
          defaultValue={filters.query} placeholder="e.g. CMPS 240 or mathematics" />
      </div>
      <div className={styles.departmentField}>
        <label htmlFor="course-department">Department</label>
        <select id="course-department" name="department" defaultValue={filters.department}>
          <option value="">All departments</option>
          {filters.department && !departments.includes(filters.department) &&
            <option value={filters.department}>{filters.department} (unavailable)</option>}
          {departments.map((department) => <option key={department}>{department}</option>)}
        </select>
      </div>
      <div className={styles.rangeFilters}>
        {COURSE_RANGE_FILTERS.map((range) => <fieldset key={range.name} className={styles.rangeFilter}>
          <legend>{range.name}</legend>
          <div className={styles.rangeInputs}>
            {([['Minimum', range.minimum], ['Maximum', range.maximum]] as const).map(([label, key]) => <div key={key}>
              <label htmlFor={`course-${key}`}>{label}</label>
              <input id={`course-${key}`} type="number" name={key} aria-label={`${label} ${range.name.toLowerCase()}`}
                min={range.min} max={range.max} step={range.step} inputMode="decimal"
                defaultValue={filters[key] ?? ""} placeholder="Any" />
            </div>)}
          </div>
        </fieldset>)}
        <p className={styles.filterHint}>Leave bounds empty for any value. Difficulty and workload use displayed averages out of 5 and require at least 3 reviews.</p>
      </div>
      <button type="submit">Search courses</button>
      <ClearCourseFilters href={coursesUrl({ query: "", department: "", page: 1, compare: filters.compare })} />
    </CourseFilterForm>

    {!filterError && <p className={styles.summary} role="status">
      {total.toLocaleString("en-US")} {total === 1 ? "course" : "courses"} found
      {filters.query && <> for “{filters.query}”</>}
      {total > 0 && <> · Showing {(page - 1) * COURSES_PER_PAGE + 1}–{Math.min(page * COURSES_PER_PAGE, total)}</>}
    </p>}

    {filterError ? <section className={`${styles.notice} ${styles.filterError}`} role="alert" aria-labelledby="filter-error-title">
      <h2 id="filter-error-title">Check your filter ranges</h2>
      <p>{filterError}</p>
      <p>Adjust the bounds above and search again.</p>
    </section> : total === 0 ? <section className={styles.notice}>
      <h2>No courses found</h2>
      <p>Try another name or code, adjust the ranges, or choose a different department.</p>
      <Link href={coursesUrl({ query: "", department: "", page: 1, compare: filters.compare })}>Browse all courses</Link>
    </section> : [...groups].map(([department, rows]) => (
      <section key={department} className={styles.department} aria-label={department}>
        <h2>{department}</h2>
        <div className={styles.grid}>
          {rows.map((course) => <article key={course.id} className={styles.card}>
            <details className={styles.courseDetails}>
              <summary className={styles.courseToggle}>
                <div className={styles.cardTop}>
                  <span className={styles.code}>{course.code}</span>
                  <span className={styles.credits}>{Number(course.credits)} {Number(course.credits) === 1 ? "credit" : "credits"}</span>
                </div>
                <h3>{course.name}</h3>
                <p className={styles.description}>{course.description}</p>
                <span className={styles.descriptionToggle}>
                  <span className={styles.collapsedLabel}>Read full description ↓</span>
                  <span className={styles.expandedLabel}>Hide description ↑</span>
                </span>
              </summary>
              <p className={styles.fullDescription}>{course.description}</p>
            </details>
            <RatingSummary courseCode={course.code} summary={ratings.get(course.id)} compact />
            <Link href={courseUrl(course.code, { ...filters, page })} className={styles.coursePageLink}
              aria-label={`View course ${course.code}`}>
              View course →
            </Link>
            <div><ComparisonToggle code={course.code} filters={{ ...filters, page }} /></div>
          </article>)}
        </div>
      </section>
    ))}

    {total > 0 && <nav className={styles.pagination} aria-label="Course pages">
      <span>{page > 1 && <Link href={coursesUrl(filters, page - 1)}>← Previous</Link>}</span>
      <span>Page {page} of {pages}</span>
      <span>{page < pages && <Link href={coursesUrl(filters, page + 1)}>Next →</Link>}</span>
    </nav>}
  </>;
}
