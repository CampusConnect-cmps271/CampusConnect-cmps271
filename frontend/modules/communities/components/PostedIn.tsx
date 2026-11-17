import Link from "next/link";
import { getPostCommunity } from "../queries";

/**
 * " in <community>", right after the author's name on a community post's
 * page; nothing on any other post. Inline, so it sits inside the author line.
 */
export async function PostedIn({ postId }: { postId: string }) {
  const community = await getPostCommunity(postId);
  if (!community) return null;
  return (
    <span>
      {" "}
      in{" "}
      <Link href={`/communities/${community.slug}`} className="font-medium text-[var(--maroon)] hover:underline">
        {community.name}
      </Link>
    </span>
  );
}
