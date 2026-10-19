import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseUnavailable, getCourseDetail } from "./detail";
import { courseUrl } from "./references";
import { coursesUrl, type CourseFilters } from "./search";
import styles from "./courses.module.css";
import { ReviewSection } from "@/modules/reviews/ReviewSection";
import { RatingSection } from "@/modules/ratings/RatingSection";
import { ComparisonSelection, ComparisonToggle } from "./ComparisonSelection";

export async function CourseDetail({ code, filters }: { code: string; filters: CourseFilters }) {
  let detail;
  try {
    detail = await getCourseDetail(code);
  } catch (error) {
    if (!(error instanceof CourseUnavailable)) throw error;
    return <main className={styles.page}>
      <Link href={coursesUrl(filters)}>← Back to courses</Link>
      <section className={`${styles.notice} ${styles.detailNotice}`} role="alert" aria-labelledby="course-error-title">
        <h1 id="course-error-title">Course couldn’t be loaded</h1>
        <p>The course information is temporarily unavailable. Please try again.</p>
        <a href={courseUrl(code, filters)}>Try again</a>
      </section>
    </main>;
  }
  if (!detail) notFound();
  const { course, prerequisiteParts, references, linksUnavailable, hasUnresolvedReferences } = detail;

  return <main className={styles.page}>
    <Link href={coursesUrl(filters)}>← Back to courses</Link>
    <header className={styles.header}>
      <p className={styles.eyebrow}>{course.code}</p>
      <h1>{course.name}</h1>
    </header>

    <ComparisonSelection filters={filters} />
    <ComparisonToggle code={course.code} filters={filters} />

    <dl className={styles.courseFacts} aria-label="Course facts">
      <div><dt>Credits</dt><dd>{Number(course.credits)} {Number(course.credits) === 1 ? "credit" : "credits"}</dd></div>
      <div><dt>Department</dt><dd>
        <Link href={coursesUrl({ query: "", department: course.department, page: 1, compare: filters.compare })}>{course.department}</Link>
      </dd></div>
    </dl>

    <div className={styles.detailSections}>
      <section className={styles.detailPanel} aria-labelledby="course-description-title">
        <h2 id="course-description-title">Course description</h2>
        <p className={styles.detailProse}>{course.description}</p>
      </section>

      <section className={styles.detailPanel} aria-labelledby="course-prerequisites-title">
        <h2 id="course-prerequisites-title">Prerequisites</h2>
        {course.prerequisites.trim() ? <p className={styles.detailProse}>
          {prerequisiteParts.map((part, index) => {
            const referenced = part.code ? references.get(part.code) : undefined;
            return referenced ? <Link key={index} href={courseUrl(referenced.code, filters)} title={referenced.name}>
              {part.text}
            </Link> : part.text;
          })}
        </p> : <p>No prerequisites are listed in the catalogue.</p>}
        {linksUnavailable ? <p className={styles.detailHint} role="status">Prerequisite links are temporarily unavailable. The catalogue requirements are shown above.</p>
          : hasUnresolvedReferences && <p className={styles.detailHint}>Some referenced courses are not available in this catalogue yet.</p>}
      </section>

      <section className={styles.detailPanel} aria-labelledby="course-reviews-title">
        <h2 id="course-reviews-title">Ratings and reviews</h2>
        <RatingSection courseId={course.id} courseCode={course.code} />
        <ReviewSection courseId={course.id} />
      </section>
    </div>
  </main>;
}
