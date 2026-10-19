import { getCourseRatings } from "./queries";
import { RatingSummary } from "./RatingSummary";

export async function RatingSection({ courseId, courseCode }: { courseId: string; courseCode: string }) {
  const summaries = await getCourseRatings([courseId]);
  return <RatingSummary courseCode={courseCode} summary={summaries.get(courseId)} />;
}
