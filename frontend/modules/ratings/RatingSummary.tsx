import { formatRating, MIN_RATING_REVIEWS, RATING_DIMENSIONS, type RatingSummary as Summary } from "./model";
import styles from "./ratings.module.css";

export function RatingSummary({ courseCode, summary, compact = false }: {
  courseCode: string; summary?: Summary; compact?: boolean;
}) {
  const Heading = compact ? "h4" : "h3";
  return <div className={`${styles.summary} ${compact ? styles.compact : ""}`}
    role="group" aria-label={`Course ratings for ${courseCode}`}>
    <Heading className={styles.heading}>Average ratings</Heading>
    {!summary || summary.status === "unavailable" ?
      <p className={styles.note}>Ratings are temporarily unavailable. Refresh to try again.</p>
      : <>
        <p className={styles.count}>{summary.reviewCount.toLocaleString("en-US")} {summary.reviewCount === 1 ? "review" : "reviews"}</p>
        {summary.status === "insufficient" ? <>
          <p className={styles.empty}>Not enough reviews yet.</p>
          <p className={styles.note}>Averages appear after {MIN_RATING_REVIEWS} reviews.</p>
        </> : <>
          <dl className={styles.metrics}>
            {RATING_DIMENSIONS.map(([key, label]) => <div key={key}>
              <dt>{label}</dt>
              <dd><span className={styles.score}>{formatRating(summary.averages[key])}</span><span className={styles.scale}> / 5</span></dd>
            </div>)}
          </dl>
          <p className={styles.note}>Higher difficulty and workload scores mean harder courses and heavier workloads.</p>
        </>}
      </>}
  </div>;
}
