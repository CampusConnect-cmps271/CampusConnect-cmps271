import Link from "next/link";
import { ComparisonUnavailable, getCourseComparison } from "./comparison-query";
import { comparisonUrl } from "./comparison";
import { courseUrl } from "./references";
import type { CourseFilters } from "./search";
import { formatRating, RATING_DIMENSIONS } from "@/modules/ratings/model";
import styles from "./comparison.module.css";

export async function CourseComparison({ filters }: { filters: CourseFilters }) {
  let result;
  try { result = await getCourseComparison(filters.compare ?? []); }
  catch (error) {
    if (!(error instanceof ComparisonUnavailable)) throw error;
    return <section className={styles.notice} role="alert" aria-label="Comparison unavailable">
      <h2>Comparison couldn’t be loaded</h2><p>Please try again. Your selection is still in the URL.</p>
      <a href={comparisonUrl(filters)}>Try comparison again</a>
    </section>;
  }
  const { courses, ratings, missing } = result;
  return <>
    {missing.length > 0 && <p role="alert" aria-label="Selected courses unavailable" className={styles.notice}>
      {missing.join(", ")} {missing.length === 1 ? "is" : "are"} not available in this catalogue. Remove the missing course and choose another.
    </p>}
    {courses.length >= 2 ? <>
      <p className={styles.hint} id="comparison-hint">Averages appear after 3 reviews. Higher difficulty and workload mean harder courses and heavier workloads. On a small screen, scroll the table sideways.</p>
      <div className={styles.tableRegion} role="region" aria-label="Course comparison table" tabIndex={0} aria-describedby="comparison-hint">
        <table className={styles.table}>
          <caption>Course requirements and average ratings</caption>
          <thead><tr><th scope="col">Course</th>{courses.map((course) => <th key={course.id} scope="col">
            <Link href={courseUrl(course.code, filters)}>{course.code}</Link><span className={styles.title}>{course.name}</span>
          </th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">Credits</th>{courses.map((course) => <td key={course.id}>{course.credits}</td>)}</tr>
            <tr><th scope="row">Department</th>{courses.map((course) => <td key={course.id}>{course.department}</td>)}</tr>
            <tr><th scope="row">Prerequisites</th>{courses.map((course) => <td className={styles.prose} key={course.id}>{course.prerequisites.trim() || "No prerequisites are listed in the catalogue."}</td>)}</tr>
            <tr><th scope="row">Reviews</th>{courses.map((course) => {
              const summary = ratings.get(course.id);
              return <td key={course.id}>{summary && summary.status !== "unavailable" ? summary.reviewCount : "Temporarily unavailable"}</td>;
            })}</tr>
            {RATING_DIMENSIONS.map(([key, label]) => <tr key={key}><th scope="row">{label}</th>{courses.map((course) => {
              const summary = ratings.get(course.id);
              return <td key={course.id}>{summary?.status === "ready" ? `${formatRating(summary.averages[key])} / 5`
                : summary?.status === "insufficient" ? "Not enough reviews yet." : "Ratings temporarily unavailable."}</td>;
            })}</tr>)}
          </tbody>
        </table>
      </div>
    </> : <p className={styles.notice}>Choose at least two available courses from the catalogue to compare.</p>}
  </>;
}
