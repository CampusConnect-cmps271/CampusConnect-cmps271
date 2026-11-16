/**
 * Public API of the communities module (SCRUM-236). Import from
 * "@/modules/communities", never from a file inside it.
 *
 * Note: this barrel re-exports server-only code, so a Client Component must
 * not import it. Client Components inside the module import their siblings
 * directly.
 */

export {
  archiveCommunity,
  createCommunity,
  createCommunityPost,
  findCourseCommunities,
  findCourses,
  followCommunity,
  joinCommunity,
  leaveCommunity,
  unfollowCommunity,
  updateCommunity,
  type CommunityActionState,
  type CommunityFormState,
  type CommunityPostFormState,
} from "./actions";

export {
  discoverCommunities,
  findCourseByCode,
  getCommunityBySlug,
  getMembership,
  getPostCommunity,
  isModeratorOrAdmin,
  listCommunityPosts,
  listCourseCommunities,
  listFollowingFeed,
  listMyCommunities,
  listSuggestions,
  searchCourses,
} from "./queries";

export {
  COMMUNITY_LIMITS,
  COMMUNITY_POST_CATEGORIES,
  COMMUNITY_TOPICS,
  communityIdSchema,
  communityPostSchema,
  communitySchema,
  communitySlugSchema,
  EMPTY_COMMUNITY_FORM,
  EMPTY_COMMUNITY_POST_FORM,
  isCommunityTopic,
  readCommunityForm,
  readCommunityPostForm,
  tidyName,
  TOPIC_LABELS,
  validateCommunityForm,
  validateCommunityPostForm,
  type CommunityFieldErrors,
  type CommunityFormValues,
  type CommunityInput,
  type CommunityPostFieldErrors,
  type CommunityPostFormValues,
  type CommunityPostInput,
  type CommunityTopic,
} from "./schema";

export {
  DIRECTORY_PAGE_SIZE,
  directorySearchFilter,
  escapeLikePattern,
  MAX_PAGES,
  parseDirectorySearch,
  parsePages,
  parseSearchText,
  POSTS_PAGE_SIZE,
  type DirectorySearch,
  type DirectorySort,
} from "./search";

export { matchesInterest, MAX_SUGGESTIONS, suggestCommunities, type SuggestionPlan } from "./suggestions";

export { ARCHIVED_MESSAGE, communityErrorMessage, NOT_FOUND_MESSAGE, type CommunityOperation } from "./errors";

export type { CommunityPost, CommunitySummary, CourseOption, Membership, Suggestion } from "./types";

export { ArchiveControl } from "./components/ArchiveControl";
export { CommunityCard, membershipLabel, TopicBadge } from "./components/CommunityCard";
export { CommunityForm } from "./components/CommunityForm";
export { CommunityPostCard } from "./components/CommunityPostCard";
export { CommunityPostForm } from "./components/CommunityPostForm";
export { MembershipControls } from "./components/MembershipControls";
export { PostedIn } from "./components/PostedIn";
export { formatDate, plural } from "./components/styles";
