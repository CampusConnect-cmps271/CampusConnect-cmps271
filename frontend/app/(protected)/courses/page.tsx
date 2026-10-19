import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import { CourseCatalogue } from "@/modules/courses/CourseCatalogue";
import { parseCourseFilters, type CourseSearchParams } from "@/modules/courses/search";
import styles from "@/modules/courses/courses.module.css";

export const metadata: Metadata = { title: "Courses · CampusConnect" };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<CourseSearchParams> }) {
  await requireUser();
  const filters = parseCourseFilters(await searchParams);
  return <main className={styles.page}>
    <Link href="/home">← Campus home</Link>
    <header className={styles.header}>
      <p className={styles.eyebrow}>Explore your academics</p>
      <h1>Course catalogue</h1>
      <p>Find your next course. Browse AUB departments or search by a course name or code.</p>
    </header>
    <CourseCatalogue filters={filters} />
  </main>;
}
