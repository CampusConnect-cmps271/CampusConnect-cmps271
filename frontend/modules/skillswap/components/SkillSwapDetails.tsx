import { MessageButton } from "@/modules/messaging";
import { getProfile } from "@/modules/profiles";
import { getSkillSwapDetails } from "../queries";
import { meetingMethodLabel } from "../schema";

type SkillSwapDetailsProps = {
  postId: string;
  /** The post's body, shown as it is if the details cannot be read. */
  body: string;
};

const BOX_LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide opacity-70";
const BOX_TEXT_CLASS = "mt-1 whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]";

/**
 * A SkillSwap post's two boxes, meeting method, availability and extra
 * details, in place of the plain body, with a way to message the author.
 * Uses the page's own colours so it fits the post page in light and dark.
 */
export async function SkillSwapDetails({ postId, body }: SkillSwapDetailsProps) {
  const swap = await getSkillSwapDetails(postId);

  if (!swap) {
    return <div className="whitespace-pre-wrap break-words leading-7">{body}</div>;
  }

  const author = await getProfile(swap.authorId);
  const authorName = author?.fullName ?? "the author";

  return (
    <section aria-label="Skill swap" className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--maroon)]/40 bg-[var(--maroon)]/10 p-4">
          <h2 className={BOX_LABEL_CLASS}>Can teach</h2>
          <p className={BOX_TEXT_CLASS}>{swap.canTeach}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--maroon-50)] p-4">
          <h2 className={BOX_LABEL_CLASS}>Wants to learn</h2>
          <p className={BOX_TEXT_CLASS}>{swap.wantsToLearn}</p>
        </div>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="font-semibold">Meeting</dt>
        <dd>{meetingMethodLabel(swap.meetingMethod)}</dd>
        {swap.availability ? (
          <>
            <dt className="font-semibold">Availability</dt>
            <dd className="[overflow-wrap:anywhere]">{swap.availability}</dd>
          </>
        ) : null}
      </dl>

      {swap.details ? (
        <div>
          <h2 className={BOX_LABEL_CLASS}>Extra details</h2>
          <p className={BOX_TEXT_CLASS}>{swap.details}</p>
        </div>
      ) : null}

      {/* Renders nothing on the author's own post. */}
      <MessageButton
        studentId={swap.authorId}
        studentName={authorName}
        label={`Message ${authorName} to arrange a swap`}
      />
    </section>
  );
}
