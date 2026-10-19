import { getCourseReviews, getMyReview } from "./queries";
import { ReviewForm } from "./ReviewForm";
import { ReviewList } from "./ReviewList";
import styles from "./reviews.module.css";

export async function ReviewSection({ courseId }: { courseId: string }) {
  const [mine, published] = await Promise.all([getMyReview(courseId), getCourseReviews(courseId)]);
  if (!mine.available || !published.available) return <p role="status">Reviews couldn’t be loaded. Refresh the page to try again.</p>;
  return <div className={styles.section}>
    <ReviewList reviews={published.reviews} currentUserId={published.userId} />
    {mine.review?.status === "removed"
      ? <p role="status" className={styles.removedNotice}>Your review was removed by a moderator and is no longer visible or included in course ratings.</p>
      : <ReviewForm key={courseId} courseId={courseId} review={mine.review} />}
  </div>;
}
