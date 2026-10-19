import Link from "next/link";
import { MAX_COMPARISON_COURSES } from "./codes";
import { comparisonUrl, toggleComparison } from "./comparison";
import { coursesUrl, type CourseFilters } from "./search";
import styles from "./comparison.module.css";

export function ComparisonSelection({ filters, comparisonPage = false }: { filters: CourseFilters; comparisonPage?: boolean }) {
  const codes = filters.compare ?? [];
  return <section className={styles.selection} aria-label="Course comparison selection">
    <h2>Compare courses</h2>
    <p>Select two or three courses to compare their requirements and ratings.</p>
    <p aria-label="Comparison count">{codes.length} of {MAX_COMPARISON_COURSES} selected</p>
    {codes.length > 0 && <ul className={styles.chips}>
      {codes.map((code) => <li key={code}><Link href={(comparisonPage ? comparisonUrl : coursesUrl)(toggleComparison(filters, code))}
        scroll={false} aria-label={`Remove ${code} from selection`}>{code} ×</Link></li>)}
    </ul>}
    <div className={styles.actions}>
      {comparisonPage ? <Link className={styles.primary} href={coursesUrl(filters)}>Change selection</Link>
        : codes.length >= 2 ? <Link className={styles.primary} href={comparisonUrl(filters)}>Compare selected courses</Link>
        : <span>Select at least two courses.</span>}
      {codes.length > 0 && <Link href={coursesUrl({ ...filters, compare: [] })} scroll={false}>Clear selection</Link>}
    </div>
  </section>;
}

export function ComparisonToggle({ code, filters }: { code: string; filters: CourseFilters }) {
  const selected = filters.compare?.includes(code);
  if (!selected && (filters.compare?.length ?? 0) >= MAX_COMPARISON_COURSES) {
    return <button className={styles.toggle} type="button" disabled aria-label={`Comparison full for ${code}`}>Comparison full</button>;
  }
  return <Link className={styles.toggle} scroll={false} prefetch={false}
    href={coursesUrl(toggleComparison(filters, code))}
    aria-label={`${selected ? "Remove" : "Add"} ${code} ${selected ? "from" : "to"} comparison`}>
    {selected ? "Selected · Remove" : "Select for comparison"}
  </Link>;
}
