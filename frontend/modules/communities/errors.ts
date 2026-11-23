/** The community operations that can fail, for their messages. */
export type CommunityOperation =
  | "create"
  | "update"
  | "join"
  | "leave"
  | "follow"
  | "unfollow"
  | "archive"
  | "post";

export const ARCHIVED_MESSAGE = "This community is archived, so it takes no new members or posts.";
export const NOT_FOUND_MESSAGE = "This community no longer exists.";

const FAILED: Record<CommunityOperation, string> = {
  create: "We couldn't create the community. Please try again.",
  update: "We couldn't save your changes. Please try again.",
  join: "We couldn't join this community. Please try again.",
  leave: "We couldn't leave this community. Please try again.",
  follow: "We couldn't follow this community. Please try again.",
  unfollow: "We couldn't unfollow this community. Please try again.",
  archive: "We couldn't archive this community. Please try again.",
  post: "We couldn't post in this community. Please try again.",
};

const SUSPENDED = "Your account is suspended, so you can't do this right now.";

/**
 * The message for a database error code from a community operation. The
 * codes are the ones the communities migration raises (CM0xx) and the
 * standard ones its policies and constraints raise.
 */
export function communityErrorMessage(operation: CommunityOperation, code: string | null | undefined): string {
  switch (code) {
    case "CM001":
      return "You can create up to 3 communities a day. Try again tomorrow.";
    case "CM002":
      return "You already own 20 active communities. Archive one to create another.";
    case "CM010":
      return ARCHIVED_MESSAGE;
    case "CM011":
      return operation === "post" ? "Join this community to post in it." : "You're not a member of this community.";
    case "CM012":
      return "As the owner you can't leave. You can archive the community instead.";
    case "P0002":
      return NOT_FOUND_MESSAGE;
    case "23505":
      return "A community with this name already exists. Choose another name, or join that one.";
    case "23503":
      return "That course is no longer in the catalogue. Choose another.";
    case "42501":
      if (operation === "archive") return "Only the owner, a moderator or an administrator can archive this community.";
      return operation === "create" || operation === "post" || operation === "join" || operation === "follow" || operation === "update"
        ? SUSPENDED
        : FAILED[operation];
    default:
      return FAILED[operation];
  }
}
