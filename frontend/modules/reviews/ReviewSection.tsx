import { getMyReview } from "./queries";
import { ReviewForm } from "./ReviewForm";

export async function ReviewSection({ courseId }: { courseId: string }) {
  const result = await getMyReview(courseId);
  if (!result.available) return <p role="status">Your review couldn’t be loaded. Refresh the page to try again.</p>;
  return <ReviewForm key={courseId} courseId={courseId} review={result.review} />;
}
