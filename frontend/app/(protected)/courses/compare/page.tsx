import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import { parseComparisonSelection } from "@/modules/courses/codes";
import { ComparisonSelection } from "@/modules/courses/ComparisonSelection";
import { CourseComparison } from "@/modules/courses/CourseComparison";
import { coursesUrl, parseCourseFilters, type CourseSearchParams } from "@/modules/courses/search";
import styles from "@/modules/courses/courses.module.css";

export const metadata: Metadata = { title: "Compare courses · CampusConnect" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<CourseSearchParams> }) {
  await requireUser();
  const params = await searchParams;
  const filters = parseCourseFilters(params);
  const selection = parseComparisonSelection(params.compare);
  return <main className={styles.page}>
    <Link href={coursesUrl(filters)}>← Back to courses</Link>
    <header className={styles.header}><p className={styles.eyebrow}>Plan your courses</p>
      <h1>Compare courses</h1><p>See requirements and student ratings side by side.</p></header>
    <ComparisonSelection filters={filters} comparisonPage />
    {selection.error ? <p role="alert" aria-label="Invalid comparison selection">{selection.error}</p> : selection.codes.length < 2 ?
      <p>Choose two or three different courses from the catalogue to begin.</p> : <CourseComparison filters={filters} />}
  </main>;
}
