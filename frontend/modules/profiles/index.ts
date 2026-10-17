/**
 * Public API of the profiles module. Import from "@/modules/profiles", never
 * from a file inside it.
 *
 * Note: `queries` is server-only, so a Client Component must not import this
 * barrel. Client Components inside the module import their siblings directly.
 */

export {
  getDisplayNames,
  getMyProfile,
  getPinnedPost,
  getProfile,
} from "./queries";

export { updateMyProfile, type ProfileFormState } from "./actions";
export { pinPost, unpinPost, type PinResult } from "./pin-actions";

export { excerpt, EXCERPT_LENGTH, formatPostDate } from "./pinned-post";

export {
  parseInterests,
  postIdSchema,
  PROFILE_LIMITS,
  profileFormSchema,
  profileFormValues,
  profileIdSchema,
  readProfileForm,
  validateProfileForm,
  type ProfileFieldErrors,
  type ProfileFormValues,
  type ProfileInput,
} from "./schema";

export type { PinnedPost, Profile } from "./types";

export { InterestTags } from "./components/InterestTags";
export { PinnedPostCard } from "./components/PinnedPostCard";
export { PinPostButton } from "./components/PinPostButton";
export { ProfileCard } from "./components/ProfileCard";
export { ProfileView } from "./components/ProfileView";
