import type { MeetingMethod } from "./schema";

/** A SkillSwap post's details, as the post page and the edit form read them. */
export type SkillSwapDetails = {
  postId: string;
  authorId: string;
  canTeach: string;
  wantsToLearn: string;
  meetingMethod: MeetingMethod;
  availability: string | null;
  details: string | null;
};

/** One card on the board. */
export type SkillSwapCard = {
  postId: string;
  authorId: string;
  authorName: string;
  canTeach: string;
  wantsToLearn: string;
  meetingMethod: MeetingMethod;
  availability: string | null;
  createdAt: string;
};
