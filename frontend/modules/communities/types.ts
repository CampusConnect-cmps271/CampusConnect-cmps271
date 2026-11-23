import type { CommunityTopic } from "./schema";

/** A community with its counts, as the overview view returns it. */
export type CommunitySummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  topic: CommunityTopic;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  ownerId: string;
  status: "active" | "archived";
  archivedAt: string | null;
  createdAt: string;
  memberCount: number;
  followerCount: number;
  lastActivityAt: string;
};

/** The signed-in student's relation to one community. */
export type Membership = {
  role: "owner" | "member" | null;
  following: boolean;
};

/** A published post inside a community. */
export type CommunityPost = {
  id: string;
  communityId: string;
  communitySlug: string;
  communityName: string;
  authorId: string;
  authorName: string | null;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  editedAt: string | null;
  upvoteCount: number;
  commentCount: number;
};

/** A community suggested to the signed-in student, with why. */
export type Suggestion = {
  community: CommunitySummary;
  reason: string;
};

/** A catalogue course offered by the course picker. */
export type CourseOption = {
  id: string;
  code: string;
  name: string;
};
