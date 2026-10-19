import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import styles from "@/modules/courses/courses.module.css";

export default function CourseNotFound() {
  return <AppShell><main className={styles.page}>
    <section className={`${styles.notice} ${styles.detailNotice}`}>
      <h1>Course not found</h1>
      <p>This course is not available in the catalogue. Check the course code or browse the available courses.</p>
      <Link href="/courses">Browse courses</Link>
    </section>
  </main></AppShell>;
}
