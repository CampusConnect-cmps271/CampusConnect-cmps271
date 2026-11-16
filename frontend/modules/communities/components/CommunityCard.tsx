import Link from "next/link";
import { TOPIC_LABELS } from "../schema";
import type { CommunitySummary, Membership } from "../types";
import { CARD, FOCUS, plural } from "./styles";

/** A community's topic, and its course's code for a course community. */
export function TopicBadge({ community }: { community: Pick<CommunitySummary, "topic" | "courseCode"> }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--maroon-100)] px-2.5 py-0.5 text-xs font-semibold text-[var(--maroon)]">
      {community.topic === "course" && community.courseCode ? community.courseCode : TOPIC_LABELS[community.topic]}
    </span>
  );
}

export function membershipLabel(membership: Membership): string | null {
  if (membership.role === "owner") return "Owner";
  if (membership.role === "member") return membership.following ? "Member" : "Member · not following";
  return membership.following ? "Following" : null;
}

type CommunityCardProps = {
  community: CommunitySummary;
  /** Why it is suggested. */
  reason?: string;
  membership?: Membership;
};

/** A community in a list: name, topic, description and counts. */
export function CommunityCard({ community, reason, membership }: CommunityCardProps) {
  const status = membership ? membershipLabel(membership) : null;
  return (
    <article className={`${CARD} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center gap-2">
        <TopicBadge community={community} />
        {community.status === "archived" ? (
          <span className="rounded-full bg-[#f1ecee] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-soft)]">Archived</span>
        ) : null}
        {status ? <span className="text-xs font-medium text-[var(--ink-soft)]">{status}</span> : null}
      </div>
      <h3 className="text-base font-semibold text-[var(--ink)]">
        <Link href={`/communities/${community.slug}`} className={`hover:text-[var(--maroon)] hover:underline ${FOCUS}`}>
          {community.name}
        </Link>
      </h3>
      {reason ? <p className="text-sm font-medium text-[var(--maroon)]">{reason}</p> : null}
      {community.description ? (
        <p className="line-clamp-2 text-sm text-[var(--ink-soft)]">{community.description}</p>
      ) : null}
      <p className="mt-auto text-xs text-[var(--ink-soft)]">
        {plural(community.memberCount, "member")} · {plural(community.followerCount, "follower")}
      </p>
    </article>
  );
}
