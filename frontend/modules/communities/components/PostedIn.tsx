import Link from "next/link";
import { getPostCommunity } from "../queries";

/** "Posted in <community>" on a community post's page; nothing on any other post. */
export async function PostedIn({ postId }: { postId: string }) {
  const community = await getPostCommunity(postId);
  if (!community) return null;
  return (
    <p className="text-xs text-[var(--ink-soft)]">
      Posted in{" "}
      <Link href={`/communities/${community.slug}`} className="font-semibold text-[var(--maroon)] hover:underline">
        {community.name}
      </Link>
    </p>
  );
}
