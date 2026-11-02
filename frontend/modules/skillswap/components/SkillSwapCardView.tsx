import Link from "next/link";
import { formatPostDate } from "@/modules/profiles";
import { meetingMethodLabel } from "../schema";
import type { SkillSwapCard } from "../types";

const BOX_LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]";
const BOX_TEXT_CLASS = "mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-[var(--ink)] [overflow-wrap:anywhere]";

/** One SkillSwap post on the board: who, both boxes, how and when. */
export function SkillSwapCardView({ card }: { card: SkillSwapCard }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-lg bg-white p-4 text-[var(--ink)] border border-[var(--border)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <Link href={`/profile/${card.authorId}`} className="font-semibold text-[var(--maroon)] hover:underline">
          {card.authorName}
        </Link>
        <time dateTime={card.createdAt} className="text-xs text-[var(--ink-soft)]">
          {formatPostDate(card.createdAt)}
        </time>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-[var(--maroon-50)] p-3">
          <h3 className={BOX_LABEL_CLASS}>Can teach</h3>
          <p className={BOX_TEXT_CLASS}>{card.canTeach}</p>
        </div>
        <div className="rounded-md bg-[var(--maroon-50)] p-3">
          <h3 className={BOX_LABEL_CLASS}>Wants to learn</h3>
          <p className={BOX_TEXT_CLASS}>{card.wantsToLearn}</p>
        </div>
      </div>

      <p className="text-sm text-[var(--ink-soft)]">
        {meetingMethodLabel(card.meetingMethod)}
        {card.availability ? <> · {card.availability}</> : null}
      </p>

      <Link
        href={`/posts/${card.postId}`}
        className="self-start text-sm font-medium text-[var(--maroon)] hover:underline"
      >
        View skill swap<span className="sr-only"> from {card.authorName}</span> →
      </Link>
    </article>
  );
}
