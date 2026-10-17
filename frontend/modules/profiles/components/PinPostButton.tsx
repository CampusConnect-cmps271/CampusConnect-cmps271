import { getMyProfile } from "../queries";
import { PinToggle } from "./PinToggle";

/**
 * The pin control for a post page. Render it only on the signed-in student's
 * own posts; the database refuses a pin on anyone else's anyway.
 */
export async function PinPostButton({ postId }: { postId: string }) {
  const profile = await getMyProfile();
  if (!profile) return null;

  return <PinToggle postId={postId} pinned={profile.pinnedPostId === postId} />;
}
