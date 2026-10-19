import ReportDialog from "@/modules/moderation/report-dialog";
import { RATING_LABELS } from "./schema";
import type { CourseReview } from "./types";
import styles from "./reviews.module.css";

export function ReviewList({
  reviews,
  currentUserId,
}: {
  reviews: CourseReview[];
  currentUserId: string;
}) {
  return <section aria-labelledby="course-reviews-heading">
    <h3 id="course-reviews-heading">Student reviews</h3>
    {reviews.length === 0 ? <p className={styles.empty}>No reviews yet. Be the first to share your experience.</p> : null}
    <div className={styles.reviewList}>
      {reviews.map((review) => <article id={`review-${review.id}`} key={review.id} className={styles.reviewCard}>
        <div className={styles.reviewHeader}>
          <div>
            <h4>{review.student_id === currentUserId ? "Your review" : "CampusConnect student"}</h4>
            <p>{review.semester_taken} · {new Date(review.created_at).toLocaleDateString()}</p>
          </div>
          {review.student_id !== currentUserId ? <ReportDialog targetType="review" targetId={review.id} /> : null}
        </div>
        <dl className={styles.reviewRatings}>
          {(["difficulty", "workload", "usefulness", "overall"] as const).map((field) => <div key={field}>
            <dt>{RATING_LABELS[field]}</dt>
            <dd>{review[`${field}_rating`]} / 5</dd>
          </div>)}
        </dl>
        <p className={styles.reviewBody}>{review.body}</p>
      </article>)}
    </div>
  </section>;
}
